# MoonWalk

Story Navigation via Textual Input


MoonWalk is an interactive system for exploring and navigating video content through natural language queries. The system combines advanced video understanding models with intuitive 3D visualization to enable seamless story exploration.

| | |
|:--:|:--:|
| ![main.png](../assets/main.png) | ![panel.png](../assets/panel.png) |
| *Main Panel* | *Text Input Panel* |
| ![topology.png](../assets/topology.png) | ![visualization.png](../assets/visualization.png) |
| *Topology* | *Visualization* |

## Dependencies

- Python 3.10+
- Conda
- CUDA (recommended) 


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
For others to view how the system changes without interacting with it

```bash
cd moonwalk_remote/
# Open index.html in a browser or serve with a local server
python -m http.server 8001
# Visit http://localhost:8001
```

## Project Structure

```
MoonWalk/
├── back/                   # Backend server and models
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
    ├── visualization /     # Visualzation Mode
    └── topology/           # Topology visualization
```



## Development Instructions

### 1. Create Conda Environment

```bash
conda create -n moonwalk python=3.10
conda activate moonwalk
```

### 2. Install Backend Dependencies

Navigate to the `back/` directory and install required packages:

```bash
cd back/
pip install -r requirements.txt
```

**Note:** CUDA is recommended for inference. All testings were run on a single Nvidia RTX-4060 GPU.

### 3. Configure Backend

- Update `VIDEO_DIR` in [back/app.py](back/app.py) to point to your video file
- Download pre-trained model checkpoints from [here](https://github.com/showlab/UniVTG/blob/main/install.md) and place it in `back/univtg/ckpts/`
- Place embeddings in `back/embeddings/`
- Update Firebase credentials in `firebase_sdk_cred.json` for visualization features



## Features

- **Text-based Video Navigation**: Query videos using natural language
- **3D Visualization**: Interactive 3D exploration of video embeddings
- **Topology View**: Understand relationships between video segments
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


