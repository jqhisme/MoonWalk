# Includes 4 modules: VTGModel, Umap, TextSpaceProjector, and Firebase

# general import
import os
from pyexpat import model
from matplotlib import text
import numpy as np
import json
import time

# VTG model
from univtg.run_on_video import clip, vid2clip, txt2clip
from univtg.utils.basic_utils import l2_normalize_np_array
from univtg.main.config import TestOptions, setup_model
from univtg.run_on_video import clip
import torch.backends.cudnn as cudnn
import torch
import sys

# UMAP
import umap
import pickle

# LLM API
import requests

# Firebase
# TODO

def convert_to_hms(seconds):
    return time.strftime('%H:%M:%S', time.gmtime(seconds))

class VTGModel:
    def __init__(self, model_ckpt, emb_dir,clip_model_version, clip_len,gpu_id=0):
        self.model_ckpt = model_ckpt
        self.emb_dir = emb_dir
        self.clip_model_version = clip_model_version
        self.clip_len = clip_len
        self.gpu_id = gpu_id
        self.clip_model, _ = clip.load(self.clip_model_version, device=self.gpu_id, jit=False)
    
    def setup(self):
        self.model,_ = self.load_vtg_model()
        self.src_vid, self.m_vid, self.timestamp, self.ctx_len = self.load_video_emb(self.emb_dir)
        self.src_vid = self.src_vid.cuda(self.gpu_id)
        self.m_vid = self.m_vid.cuda(self.gpu_id)

    def load_vtg_model(self): 
        """
        Safe loader for VTG inside a Jupyter notebook.
        Avoids argparse picking up Jupyter kernel arguments.
        """
        
        # ---- 1. Backup sys.argv to avoid argparse conflicts ----
        argv_backup = sys.argv.copy()
        
        # ---- 2. Replace sys.argv so parser gets a clean list ----
        sys.argv = [
            "notebook",
            "--resume", self.model_ckpt,
            #"--save_dir", save_dir,
            "--gpu_id", str(self.gpu_id)
        ]

        # ---- 3. Parse options ----
        opt = TestOptions().parse()

        # ---- Restore sys.argv back so Jupyter works normally ----
        sys.argv = argv_backup

        # ---- 4. Setup model ----
        cudnn.benchmark = True
        cudnn.deterministic = False

        # LR warmup setup (copied from your code)
        if opt.lr_warmup > 0:
            total_steps = opt.n_epoch
            warmup_steps = (
                opt.lr_warmup if opt.lr_warmup > 1 
                else int(opt.lr_warmup * total_steps)
            )
            opt.lr_warmup = [warmup_steps, total_steps]

        # ---- 5. Build model ----
        model, criterion, _, _ = setup_model(opt)
        return model, opt
    
    def load_video_emb(self, save_dir):
        vid = np.load(os.path.join(save_dir, 'vid.npz'))['features'].astype(np.float32)
        vid = torch.from_numpy(l2_normalize_np_array(vid))

        ctx_len = vid.shape[0]

        timestamp = ((torch.arange(ctx_len) + self. clip_len/2) / ctx_len).unsqueeze(1).repeat(1, 2)

        # Add temporal extent feature (TEF)
        tef_st = torch.arange(ctx_len) / ctx_len
        tef_ed = tef_st + 1 / ctx_len
        tef = torch.stack([tef_st, tef_ed], dim=1)

        vid = torch.cat([vid, tef], dim=1)

        src_vid = vid.unsqueeze(0).cuda()
        m_vid  = torch.ones(src_vid.shape[:2]).cuda()

        return src_vid, m_vid, timestamp, ctx_len
    
    def embed_text(self, query):
        encoded_texts = clip.tokenize(query).to(self.gpu_id)
        text_feature = self.clip_model.encode_text(encoded_texts)['last_hidden_state']
        valid_lengths = (encoded_texts != 0).sum(1).tolist()[0]
        text_feature = text_feature[0, :valid_lengths].detach().cpu().numpy().astype(np.float32)
        return text_feature
    
    def extract_video_emb(self, video_path):
        print("Extracting video features...")
        extracted_features = vid2clip(self.clip_model, video_path,self.emb_dir, num_decoding_thread=0, half_precision=False)
        print("Done.")
        return extracted_features
    
    def forward(self, query):
        self.model.eval()
        with torch.no_grad():
            src_txt = torch.from_numpy(self.embed_text(query)).unsqueeze(0).cuda()
            m_txt = torch.ones(src_txt.shape[:2]).cuda()
            output = self.model(src_vid=self.src_vid, src_txt=src_txt, src_vid_mask=self.m_vid, src_txt_mask=m_txt)
        
        # prepare the model prediction
        pred_logits = output['pred_logits'][0].cpu()
        pred_spans = output['pred_spans'][0].cpu()
        pred_saliency = output['saliency_scores'].cpu()

        # prepare the model prediction
        pred_windows = (pred_spans + self.timestamp) * self.ctx_len * self.clip_len
        pred_confidence = pred_logits
        
        # grounding - get 3 top intervals
        # top3_indices = torch.argsort(pred_confidence.squeeze(), descending=True)[:3]
        # top3_intervals = []
        # for idx in top3_indices:
        #     window = pred_windows[idx].tolist()
        #     interval = " - ".join([convert_to_hms(int(i)) for i in window])
        #     top3_intervals.append(interval)
        #grounding - get 1 top intervals
        top1_idx = torch.argmax(pred_confidence.squeeze())
        top1_window = pred_windows[top1_idx].tolist()
        top1_interval = " - ".join([convert_to_hms(int(i)) for i in top1_window])
        
        # highlight - get top-1 highlight
        hl_idx = torch.argmax(pred_saliency.squeeze())
        hl_time = convert_to_hms(int(pred_windows[hl_idx][0].item()))
        return {
            "query": query,
            "interval": top1_interval,
            "interval_confidence": pred_confidence[top1_idx].item(),
            "highlight": hl_time,
            "highlight_confidence": pred_saliency.squeeze(0)[hl_idx].item()
        }

class SphericalUMAPWrapper(umap.UMAP):
    def __init__(self, **kwargs):
        super().__init__(
            metric ='cosine',     
            output_metric='haversine',
            **kwargs
        )
    
    def save_model(self, file_path):
        with open(file_path, 'wb') as f:
            pickle.dump(self, f)
    @classmethod
    def load_model(cls, file_path):
        with open(file_path, 'rb') as f:
            return pickle.load(f)
    
    def wrapper_fit_transform(self, x):
        emb = super().fit_transform(x, y=None, ensure_all_finite=True)
        x = np.sin(emb[:, 0]) * np.cos(emb[:, 1])
        y = np.sin(emb[:, 0]) * np.sin(emb[:, 1])
        z = np.cos(emb[:, 0]) 

        spherical_emb = np.stack([x, y, z], axis=1)
        return spherical_emb

    def wrapper_transform(self, x):
        emb = super().transform(x)
        x = np.sin(emb[:, 0]) * np.cos(emb[:, 1])
        y = np.sin(emb[:, 0]) * np.sin(emb[:, 1])
        z = np.cos(emb[:, 0]) 

        spherical_emb = np.stack([x, y, z], axis=1)
        return spherical_emb
    
    

class UMAPWrapper(umap.UMAP):
    def __init__(self, n_neighbors=15, min_dist=0.1, n_components=3, metric='euclidean', **kwargs):
        super().__init__(
            n_neighbors=n_neighbors,
            min_dist=min_dist,
            n_components=n_components,
            metric=metric,
            **kwargs
        )
        self.min_val = np.zeros(n_components)
        self.max_val = np.zeros(n_components)

    def save_model(self, file_path):
        with open(file_path, 'wb') as f:
            pickle.dump(self, f)

    @classmethod
    def load_model(cls, file_path):
        with open(file_path, 'rb') as f:
            return pickle.load(f)
    
    def wrapper_fit_transform(self, x, normalize = True):
        emb = super().fit_transform(x, y=None, ensure_all_finite=True)
        self.min_val = np.min(self.embedding_, axis=0)
        self.max_val = np.max(self.embedding_, axis=0)
        if normalize:
            emb = (emb - self.min_val) / (self.max_val - self.min_val + 1e-8)
        return emb

    def wrapper_transform(self, x, normalize = True):
        emb = super().transform(x)
        if normalize:
            emb = (emb - self.min_val) / (self.max_val - self.min_val + 1e-8)
        return emb
    
# class TextSpaceProjector:
#     def __init__(self,api_url,api_key, prompt, script, model_type, model_id):
#         self.api_url = "https://itp-ima-replicate-proxy.web.app/api/create_n_get"
#         self.api_key = None
#         self.prompt = prompt + "\nthes script\n" + script
#         self.model_type = model_type
#         self.model_id = model_id
    
#     def fetch(self, input_query):
#         payload = {
#         self.model_type: self.model_id,
#             "input":{
#                 "prompt":self.prompt+"\nThe query\n" + input_query,
#                 "temperature":0.7,
#                 "top_p":0.7
#             } 
#         }

#         response = requests.post(
#             self.api_url,
#             headers={
#                 "Content-Type": "application/json",
#                 "Accept": "application/json"
#             },
#             json=payload 
#         )
#         if response.status_code == 200:
#             output = response.json()['output']
#             print(output)
#             return output
#         else:
#             raise Exception(f"API request failed with status code {response.status_code}: {response.text}")

# class FirebaseClientWrapper:
#     pass