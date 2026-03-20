from flask import Blueprint, request, jsonify, send_from_directory
from utils import login_required, can_edit, get_current_user
import os, uuid, base64

upload_bp = Blueprint('upload', __name__)
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads_store')
ALLOWED_EXT = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}
MAX_SIZE = 8 * 1024 * 1024  # 8MB

os.makedirs(UPLOAD_DIR, exist_ok=True)

@upload_bp.route('/image', methods=['POST'])
@login_required
def upload_image():
    user = get_current_user()
    if not can_edit(user):
        return jsonify({'error': 'No permission'}), 403

    # Handle file upload
    if 'file' in request.files:
        f = request.files['file']
        if not f.filename:
            return jsonify({'error': 'No file'}), 400
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ALLOWED_EXT:
            return jsonify({'error': f'File type not allowed. Use: {", ".join(ALLOWED_EXT)}'}), 400
        data = f.read()
        if len(data) > MAX_SIZE:
            return jsonify({'error': 'File too large (max 8MB)'}), 400
        filename = f'{uuid.uuid4().hex}{ext}'
        with open(os.path.join(UPLOAD_DIR, filename), 'wb') as out:
            out.write(data)
        return jsonify({'url': f'/api/uploads/{filename}', 'filename': f.filename})

    # Handle base64 paste
    if request.is_json:
        data = request.get_json()
        b64 = data.get('base64', '')
        ext = data.get('ext', '.png')
        if not b64:
            return jsonify({'error': 'No image data'}), 400
        if ext not in ALLOWED_EXT:
            ext = '.png'
        try:
            img_data = base64.b64decode(b64.split(',')[-1])
        except Exception:
            return jsonify({'error': 'Invalid base64 data'}), 400
        if len(img_data) > MAX_SIZE:
            return jsonify({'error': 'Image too large (max 8MB)'}), 400
        filename = f'{uuid.uuid4().hex}{ext}'
        with open(os.path.join(UPLOAD_DIR, filename), 'wb') as out:
            out.write(img_data)
        return jsonify({'url': f'/api/uploads/{filename}', 'filename': filename})

    return jsonify({'error': 'No image provided'}), 400

@upload_bp.route('/<filename>', methods=['GET'])
def serve_image(filename):
    # Basic security - no path traversal
    filename = os.path.basename(filename)
    return send_from_directory(UPLOAD_DIR, filename)
