from Modules import VTGModel, UMAPWrapper, convert_to_hms, SphericalUMAPWrapper
from Visualizer import KDEVisualizer
import os
import time
import cv2
import numpy as np
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sock import Sock  
import socket # only for getting local IP address for MDNS, not for server-client communication
from zeroconf import ServiceInfo, Zeroconf

VIDEO_DIR = "../odyssey/footages.mp4"
print("Setting up VTGModel...")
vtg_model = VTGModel(
    model_ckpt="./univtg/ckpts/model_raw.ckpt",
    emb_dir="./embeddings",
    clip_model_version="ViT-B/32",
    clip_len=2,
    gpu_id=0
)
vtg_model.setup()
print("VTGModel setup complete.")

print("Setting up UMAP and Visualizer...")
reducer = SphericalUMAPWrapper.load_model("./embeddings/odyssey_spherical_umap_reducer.pkl")
visualizer = KDEVisualizer(cred_path="firebase_sdk_cred.json")
print("UMAP and Visualizer setup complete.")

print("Load Video")
cap = cv2.VideoCapture(VIDEO_DIR)
print("Video loaded.")

# MDNS setup
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

if __name__ == "__main__":
    app = Flask(__name__)
    app.config['SOCK_SERVER_OPTIONS'] = {'ping_interval': 25} 
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    sock = Sock(app)
    all_clients = set()

    
    hostname = 'odyssey-server'
    service_type = '_http._tcp.local.'
    ip_address = get_local_ip()
    zeroconf = Zeroconf()
    service_info = ServiceInfo(
        type_ = service_type,
        name = f"{hostname}.{service_type}",
        addresses = [socket.inet_aton(ip_address)],
        port = 5000,
        properties = {},
        server = f"{hostname}.local."
    )
    zeroconf.register_service(service_info)

    # health test
    @app.route("/api/health", methods=["GET"])
    def health_test():
        return jsonify({"status": "healthy", "timestamp": time.time()})

    @app.route("/", methods=["GET"])
    def home():
        return jsonify({
            "status": "running",
            "message": "Odyssey server is alive",
            "endpoints": [
                "/api/health",
                "/api/query_single",
                "/api/query_multiple",
                "/ws"
            ]
        })
    
    # query video with multiple queries separated by semicolons
    @app.route("/api/query_multiple", methods=["POST"])
    def query_video():
        try:
            data = request.json
            if not data or 'query' not in data:
                return jsonify({"error": "Missing 'query' field in request"}), 400
            query_text = data['query']
                
            # Split the query string by semicolons
            queries = [q.strip() for q in query_text.split(';') if q.strip()]
            
            if not queries:
                return jsonify({"error": "No valid queries provided"}), 400
            results = []
            for query in queries:
                result = vtg_model.forward(query)
                results.append(result)
            print(results)
            return jsonify(results), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @app.route("/api/query_single", methods=["POST"])
    def query_video_single():
        try:
            data = request.json
            if not data or 'query' not in data:
                return jsonify({"error": "Missing 'query' field in request"}), 400
            query_text = data['query']
            result = vtg_model.forward(query_text)
            print(result)
            return jsonify(result), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    @app.route("/api/text_embed",methods=["POST"])
    def get_text_embedding():
        try:
            data = request.json
            queries = data['queries']

            if not queries:
                return jsonify({"error": "No valid queries provided"}), 400
            reduced_embeddings = []

            visualizer.cache_frame()  # Cache the current frame before updating

            for query in queries:
                embedding = vtg_model.embed_text(query)
                sentence_embedding = embedding.mean(axis = 0)
                # normalize embedding using l2 norm
                sentence_embedding = sentence_embedding / (np.linalg.norm(sentence_embedding) + 1e-8)
                reduced_embedding = reducer.wrapper_transform(sentence_embedding.reshape(1, -1))
                reduced_embeddings.append(reduced_embedding.tolist())
                visualizer.add_new_query(reduced_embedding)

            visualizer.update_frame()  # Update the current frame after processing all queries
            delta_frame = visualizer.encode_delta()
            for client in all_clients:
                try:
                    client.send(delta_frame)
                except:
                    pass
            
            return jsonify({"reduced_embeddings": reduced_embeddings}), 200
        except Exception as e:
            traceback.print_exc()
            return jsonify({"error": str(e)}), 500
    
    # the request input is a time string following the format "HH:MM:SS", and the response is the corresponding video frame in base64 encoding
    @app.route("/get_frame_from_time", methods=["POST"])
    def get_frame_from_time():
        try:
            data = request.json
            if not data or 'timestamp' not in data:
                return jsonify({"error": "Missing 'timestamp' field in request"}), 400
            timestamp = data['timestamp']
            h, m, s = map(int, timestamp.split(':'))
            total_seconds = h * 3600 + m * 60 + s
            cap.set(cv2.CAP_PROP_POS_MSEC, total_seconds * 1000)
            ret, frame = cap.read()
            if not ret:
                return jsonify({"error": "Could not retrieve frame at the specified time"}), 400
            _, buffer = cv2.imencode('.jpg', frame)
            frame_base64 = buffer.tobytes().hex()
            return jsonify({"frame": frame_base64}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # Broadcast any message received from one client to all other clients (ESP32s and browsers) 
    @sock.route('/ws')
    def handle_websocket(ws):
        all_clients.add(ws)
        print("New device connected")
        try:
            while True:
                data = ws.receive() 
                if not data:
                    break
                for client in all_clients:
                    if client != ws: # Don't send it back to the sender
                        try:
                            client.send(data)
                        except:
                            pass
                print(f"Received message: {data}")        
        except:
            pass
        finally:
            all_clients.remove(ws)
            print("Device disconnected")
        
    # Run the Flask server
    try:
        print("Starting Flask server on http://localhost:5000")
        print(f"Service advertised via mDNS as {hostname}.local at IP {ip_address}")
        app.run(host='0.0.0.0', port=5000, debug=True)
    finally:
        zeroconf.unregister_service(service_info)
        zeroconf.close()
        
