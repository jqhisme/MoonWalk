import seaborn as sns
import matplotlib
matplotlib.use('Agg') 
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image
import io
import base64
import firebase_admin
from firebase_admin import credentials,firestore
import struct

class KDEVisualizer:
    def __init__(self, cred_path, screen_w=120, screen_h=120):
        self.screen_w = screen_w
        self.screen_h = screen_h
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        doc_iter = db.collection("queries").stream()
        all_coords = []
        for doc in doc_iter:
            doc_dict = doc.to_dict()
            coords = doc_dict["coordinate"]
            all_coords += [coords]
        if all_coords:
            self.all_coords = np.asarray(all_coords, dtype=np.float32)
            if self.all_coords.ndim == 1:
                self.all_coords = self.all_coords.reshape(1, -1)
        else:
            self.all_coords = np.empty((0, 3), dtype=np.float32)

        self.current_frame = np.zeros((self.screen_h, self.screen_w, 3), dtype=np.uint8)
        self.prev_frame    = np.zeros((self.screen_h, self.screen_w, 3), dtype=np.uint8)

    def render_kde(self):
        if self.all_coords.shape[0] < 2:
            return np.zeros((self.screen_h, self.screen_w, 3), dtype=np.uint8)

        fig, ax = plt.subplots(figsize=(1.2, 1.6), dpi=100)
        fig.patch.set_facecolor('black')
        ax.set_facecolor('black')

        sns.kdeplot(
            x=self.all_coords[:, 2],
            y=self.all_coords[:, 0],
            hue=(self.all_coords[:, 1] >= 0.5).astype(int),
            palette=['#abb3c2', '#9c8d6e'],
            bw_adjust=0.8,
            thresh=0,
            levels=20,
            ax=ax
        )

        ax.axis('off')
        ax.legend_.remove()
        plt.tight_layout(pad=0)

        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', pad_inches=0)
        plt.close(fig)
        buf.seek(0)

        img = Image.open(buf).convert('RGB').resize((self.screen_w, self.screen_h), Image.LANCZOS)
        return np.array(img)

    def add_new_query(self, coord):
        coord = np.asarray(coord, dtype=np.float32).reshape(1, -1)
        if self.all_coords.size == 0:
            self.all_coords = coord
            return
        if self.all_coords.ndim == 1:
            self.all_coords = self.all_coords.reshape(1, -1)
        if self.all_coords.shape[1] != coord.shape[1]:
            raise ValueError(f"Coordinate dimension mismatch: expected {self.all_coords.shape[1]}, got {coord.shape[1]}")
        self.all_coords = np.vstack([self.all_coords, coord])

    def update_frame(self):
        self.current_frame = self.render_kde()
    
    def cache_frame(self):
        self.prev_frame = self.current_frame.copy()
    
    def encode_delta(self):
        # convert both frames to RGB565
        def to_rgb565(img):
            r = img[:,:,0].astype(np.uint16)
            g = img[:,:,1].astype(np.uint16)
            b = img[:,:,2].astype(np.uint16)
            return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)

        curr565 = to_rgb565(self.current_frame)
        prev565 = to_rgb565(self.prev_frame)

        # find changed pixels
        diff_mask = curr565 != prev565
        changed   = np.argwhere(diff_mask)  # (row, col) pairs

        out = bytearray()
        out += struct.pack('>H', len(changed))

        for row, col in changed:
            idx   = row * self.screen_w + col
            color = curr565[row, col]
            out  += struct.pack('>HH', idx, color)

        return "KDE:" + base64.b64encode(out).decode('utf-8')




