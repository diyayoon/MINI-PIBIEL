import os, base64, uuid
from flask import Flask, request, jsonify, send_from_directory, url_for, abort
from flask_cors import CORS
from stego import embed_lsb_2bit, extract_lsb_2bit

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
FRONT_DIR = os.path.join(APP_ROOT, "Front-end")
UPLOAD_DIR = os.path.join(APP_ROOT, "storage", "uploads")
OUTPUT_DIR = os.path.join(APP_ROOT, "storage", "outputs")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

app = Flask(__name__, static_folder=FRONT_DIR, static_url_path="/static")
CORS(app)

app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024 # 25 MB limit

ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".webp"}

def _ext_of(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lower()

def _validate_file(fs):
    ext = _ext_of(fs.filename)
    if ext not in ALLOWED_EXTS:
        abort(415, description=f"Ekstensi tidak didukung: {ext}. Pakai PNG/JPG/JPEG/WebP.")

@app.get("/")
def spa():
    return send_from_directory(app.static_folder, "index.html")

def _save_upload(fs, prefix=""):
    _validate_file(fs)
    ext = _ext_of(fs.filename)
    name = f"{prefix}{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, name)
    fs.save(path)
    return path, name, ext

@app.post("/api/encrypt")
def api_encrypt():
    original = request.files.get("original")
    cover    = request.files.get("cover")
    secret   = (request.form.get("secret_key") or "").strip()

    if not original or not cover:
        return jsonify(ok=False, error="Upload 'original' & 'cover'"), 400
    if not secret:
        return jsonify(ok=False, error="Isi 'secret_key'"), 400

    # simpan upload
    orig_path, _, orig_ext = _save_upload(original, "orig-")
    cover_path, _, _ = _save_upload(cover, "cov-")

    with open(orig_path, "rb") as f:
        original_bytes = f.read()
    try:
        stego_png_bytes = embed_lsb_2bit(cover_path, original_bytes, orig_ext, secret)
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 422

    file_id  = uuid.uuid4().hex
    out_name = f"stego-{file_id}.png"
    out_path = os.path.join(OUTPUT_DIR, out_name)
    with open(out_path, "wb") as f:
        f.write(stego_png_bytes)

    preview_b64 = base64.b64encode(stego_png_bytes).decode("utf-8")
    return jsonify(
        ok=True,
        file_id=file_id,
        download_url=url_for("download_output", file_id=file_id, _external=False),
        preview=f"data:image/png;base64,{preview_b64}",
    )

@app.post("/api/decrypt")
def api_decrypt():
    stego  = request.files.get("stego")
    secret = (request.form.get("secret_key") or "").strip()
    if not stego:
        return jsonify(ok=False, error="Upload 'stego'"), 400
    if not secret:
        return jsonify(ok=False, error="Isi 'secret_key'"), 400

    stego_path, _, _ = _save_upload(stego, "stego-")

    try:
        original_bytes, ext = extract_lsb_2bit(stego_path, secret)
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 422

    file_id  = uuid.uuid4().hex
    out_ext  = f".{(ext or 'png')}"
    out_name = f"extract-{file_id}{out_ext}"
    out_path = os.path.join(OUTPUT_DIR, out_name)
    with open(out_path, "wb") as f:
        f.write(original_bytes)


    is_img = (ext.lower() in ("png","jpg","jpeg","webp"))
    body = {
        "ok": True,
        "download_url": url_for("download_output", file_id=file_id, _external=False)
    }
    if is_img:
        mime = "png" if ext=="png" else "jpeg" if ext in ("jpg","jpeg") else "webp"
        body["preview"] = f"data:image/{mime};base64,{base64.b64encode(original_bytes).decode('utf-8')}"
    return jsonify(body)

@app.get("/download/<file_id>")
def download_output(file_id):
    for fname in os.listdir(OUTPUT_DIR):
        if fname.startswith(f"stego-{file_id}") or fname.startswith(f"extract-{file_id}"):
            return send_from_directory(OUTPUT_DIR, fname, as_attachment=True, download_name=fname)
    abort(404)

@app.errorhandler(413)
def too_large(_):
    return jsonify(ok=False, error="Ukuran file melebihi batas"), 413

@app.errorhandler(415)
def bad_type(e):
    return jsonify(ok=False, error=e.description or "Tipe file tidak didukung"), 415

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)