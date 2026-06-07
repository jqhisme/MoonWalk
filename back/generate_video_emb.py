from Modules import SphericalUMAPWrapper, VTGModel, UMAPWrapper,convert_to_hms
import numpy as np
import os

MODEL_CKPT = "./univtg/ckpts/model_raw.ckpt"
EMB_DIR = "./embeddings"
VID_PATH    = "../odyssey/footages_nocolorgrading.mp4"  

vtg_model = VTGModel(
    model_ckpt=MODEL_CKPT,
    emb_dir=EMB_DIR,
    clip_model_version="ViT-B/32",
    clip_len=2,
    gpu_id=0
)

reducer = UMAPWrapper(n_neighbors=15, min_dist=0.1, n_components=3)
spherical_reducer = SphericalUMAPWrapper()



video_features = vtg_model.extract_video_emb(VID_PATH)
print(f"Extracted video features with shape: {video_features.shape}")

vid_reduced= reducer.wrapper_fit_transform(video_features, normalize=True)
vid_spherical_reduced = spherical_reducer.wrapper_fit_transform(video_features)
# save features_3d as npz
np.savez(os.path.join(EMB_DIR, "odyssey_vid_reduced.npz"), features_3d=vid_reduced)
np.savez(os.path.join(EMB_DIR, "odyssey_vid_spherical_reduced.npz"), features_3d=vid_spherical_reduced)
reducer.save_model(os.path.join(EMB_DIR, "odyssey_umap_reducer.pkl"))
spherical_reducer.save_model(os.path.join(EMB_DIR, "odyssey_spherical_umap_reducer.pkl"))

print(f"Video features extracted and reduced to 3D. Saved to {EMB_DIR}/odyssey_vid_reduced.npz and {EMB_DIR}/odyssey_umap_reducer.pkl")

