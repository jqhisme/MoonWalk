# MoonWalk

Story Navigation via Textual Input

MoonWalk is an interactive system for exploring and navigating video content through natural language queries. The system combines advanced video understanding models with intuitive 3D visualization to enable seamless story exploration.

## Project Structure

```
MoonWalk/
├── back/                    # Backend server and models
│   ├── app.py              # Flask backend server
│   ├── Modules.py          # Core models (VTGModel, UMAP, etc.)
│   ├── Visualizer.py       # Visualization utilities
│   ├── embeddings/         # Pre-computed embeddings
│   └── univtg/            # Video grounding model
├── moonwalk_main/          # Main interactive frontend
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   └── topology/           # Topology visualization
└── moonwalk_remote/        # Read-only viewer frontend
    ├── index.html
    ├── script.js
    ├── style.css
    └── topology/           # Topology visualization
```

## Requirements

- Python 3.8+
- Conda
- Node.js (for frontend development)

## Setup Instructions

### 1. Create Conda Environment

```bash
conda create -n moonwalk python=3.8
conda activate moonwalk
```

### 2. Install Backend Dependencies

Navigate to the `back/` directory and install required packages:

```bash
cd back/
pip install flask flask-cors flask-sock zeroconf opencv-python numpy scikit-learn
```

**Note:** Depending on your CUDA setup, you may also need to install PyTorch. For GPU support:

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

For CPU only:

```bash
pip install torch torchvision torchaudio
```

### 3. Configure Backend

- Update `VIDEO_DIR` in [back/app.py](back/app.py) to point to your video file
- Ensure pre-trained model checkpoints are in `back/univtg/ckpts/`
- Place embeddings in `back/embeddings/`
- (Optional) Update Firebase credentials in `firebase_sdk_cred.json` for visualization features

## Running the System

### Start the Backend Server

```bash
cd back/
python app.py
```

The server will start and be accessible at `http://localhost:5000` (or your local network IP via mDNS).

### Run the Frontend

There are two frontend versions:

#### **MoonWalk Main** (Interactive Mode)
For users who want to interact with and play with the system:

```bash
cd moonwalk_main/
# Open index.html in a browser or serve with a local server
python -m http.server 8000
# Visit http://localhost:8000
```

#### **MoonWalk Remote** (Read-only Viewer)
For others to view and explore the system without making changes:

```bash
cd moonwalk_remote/
# Open index.html in a browser or serve with a local server
python -m http.server 8001
# Visit http://localhost:8001
```

## Features

- **Text-based Video Navigation**: Query videos using natural language
- **3D Visualization**: Interactive 3D exploration of video embeddings
- **Topology View**: Understand relationships between video segments
- **mDNS Discovery**: Easy local network access without IP configuration
- **Two Interface Modes**: Interactive editing (Main) and read-only viewing (Remote)

## Architecture

### Backend
- **Flask Server**: REST API and WebSocket support
- **VTG Model**: Video temporal grounding using Univtg
- **UMAP Reducer**: Dimensionality reduction for visualization
- **Video Processing**: CV2-based video analysis and frame extraction

### Frontend
- **Three.js**: 3D visualization and rendering
- **Interactive UI**: Query input and result display
- **Responsive Design**: Works on desktop and tablet devices

## Troubleshooting

- **Backend won't start**: Ensure all dependencies are installed and the conda environment is activated
- **Connection refused**: Check that the backend is running and accessible at the configured IP/port
- **Missing embeddings**: Verify embedding files exist in `back/embeddings/`
- **CUDA errors**: If using GPU, ensure PyTorch is installed with correct CUDA version

## Development

To modify and extend the system:

1. Backend changes: Edit files in `back/` and restart `app.py`
2. Frontend changes: Edit HTML/CSS/JS files in `moonwalk_main/` or `moonwalk_remote/`
3. Model updates: Retrain models and update checkpoint paths in configuration

## License

[Add your license information here]

## Contact

[Add contact information here]
