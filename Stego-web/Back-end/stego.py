# stego.py
from PIL import Image
import io, hashlib

MAGIC = b'PAB1'  # penanda payload

def _keystream(key: str, n: int) -> bytes:
    """Hasilkan keystream sepanjang n bytes dari key (SHA256 CTR)."""
    key_bytes = key.encode('utf-8')
    out = bytearray()
    counter = 0
    while len(out) < n:
        h = hashlib.sha256(key_bytes + counter.to_bytes(8, 'big')).digest()
        out.extend(h)
        counter += 1
    return bytes(out[:n])

def _xor(data: bytes, key: str) -> bytes:
    ks = _keystream(key, len(data))
    return bytes([a ^ b for a, b in zip(data, ks)])

def _img_to_channels(im: Image.Image):
    """RGB → list of channel values (r,g,b, r,g,b, ...)"""
    if im.mode != 'RGB':
        im = im.convert('RGB')
    w, h = im.size
    pixels = list(im.getdata())
    flat = []
    for r,g,b in pixels:
        flat.extend((r,g,b))
    return im, w, h, flat

def _channels_to_img(w: int, h: int, chans):
    """balikkan list channel → Image RGB"""
    it = iter(chans)
    pixels = list(zip(it, it, it))
    im = Image.new('RGB', (w,h))
    im.putdata(pixels)
    return im

def _bytes_to_2bit_chunks(data: bytes):
    """pecah tiap byte jadi 4 potongan 2-bit: b7b6, b5b4, b3b2, b1b0 (MSB→LSB)"""
    for byte in data:
        yield (byte >> 6) & 0b11
        yield (byte >> 4) & 0b11
        yield (byte >> 2) & 0b11
        yield (byte >> 0) & 0b11

def _chunks2_to_bytes(chunks):
    """gabung potongan 2-bit (per 4 potongan = 1 byte) → bytes"""
    out = bytearray()
    it = iter(chunks)
    for a,b,c,d in zip(it, it, it, it):
        out.append(((a & 3) << 6) | ((b & 3) << 4) | ((c & 3) << 2) | (d & 3))
    return bytes(out)

def _build_payload(original_bytes: bytes, original_ext: str, key: str) -> bytes:
    # ext disimpan tanpa titik, max 8 char
    ext_clean = (original_ext or '').lower().lstrip('.')
    ext_clean = ext_clean[:8]
    ext_len = len(ext_clean)
    orig_size = len(original_bytes)

    cipher = _xor(original_bytes, key)

    header = MAGIC + bytes([ext_len]) + ext_clean.encode('ascii', 'ignore') + orig_size.to_bytes(4, 'big')
    return header + cipher

def _parse_payload(payload: bytes, key: str):
    # baca MAGIC
    if payload[:4] != MAGIC:
        raise ValueError("Payload tidak valid atau kunci salah.")
    ext_len = payload[4]
    p = 5
    ext = payload[p:p+ext_len].decode('ascii', 'ignore')
    p += ext_len
    orig_size = int.from_bytes(payload[p:p+4], 'big'); p += 4
    cipher = payload[p:p+orig_size]
    original_bytes = _xor(cipher, key)
    return original_bytes, ext

def embed_lsb_2bit(cover_path: str, original_bytes: bytes, original_ext: str, key: str) -> bytes:
    """Sisipkan original_bytes ke LSB cover (2-bit per channel). Return PNG bytes stego."""
    im = Image.open(cover_path)
    im, w, h, chans = _img_to_channels(im)

    payload = _build_payload(original_bytes, original_ext, key)
    needed_bits = len(payload) * 8
    capacity_bits = w * h * 3 * 2  # 2 LSB x 3 channel

    if needed_bits > capacity_bits:
        raise ValueError(f"Payload terlalu besar ({len(payload)} bytes) untuk cover ini. "
                         f"Maks ~{capacity_bits//8} bytes. Gunakan cover yang lebih besar atau file asli yang lebih kecil.")

    # tanam
    chunks = _bytes_to_2bit_chunks(payload)
    chans_mod = list(chans)
    i = 0
    for two_bits in chunks:
        chans_mod[i] = (chans_mod[i] & 0b11111100) | (two_bits & 0b11)
        i += 1
    # sisanya biarkan

    out_im = _channels_to_img(w, h, chans_mod)
    buf = io.BytesIO()
    out_im.save(buf, format='PNG')  # simpan sebagai PNG agar LSB tidak rusak
    return buf.getvalue()

def extract_lsb_2bit(stego_path: str, key: str) -> bytes:
    """Ambil payload dari stego → kembalikan BYTES original + ekstensi (di return tuple)"""
    im = Image.open(stego_path)
    im, w, h, chans = _img_to_channels(im)

    # kita tidak tahu panjang payload; baca bertahap:
    # 1) baca dulu 5 byte awal (MAGIC + ext_len)
    need_first = 5
    chunks = []
    total_bits_read = 0
    for val in chans:
        chunks.append(val & 0b11)
        total_bits_read += 2
        if len(chunks) >= need_first * 4:
            break
    header_first = _chunks2_to_bytes(chunks)
    if header_first[:4] != MAGIC:
        raise ValueError("Stego tidak mengandung payload PeekABoo atau kunci salah.")

    ext_len = header_first[4]
    # 2) butuh header penuh sampai MAGIC(4) + 1 + ext_len + 4 = 9 + ext_len byte
    need_header = 4 + 1 + ext_len + 4
    while len(chunks) < need_header * 4:
        idx = len(chunks)
        chans_idx = idx  # karena 1 chunk = 1 channel (2 bit)
        if chans_idx >= len(chans):
            raise ValueError("Data tidak lengkap.")
        chunks.append(chans[chans_idx] & 0b11)

    header_full = _chunks2_to_bytes(chunks)[:need_header]
    p = 5
    ext = header_full[p:p+ext_len].decode('ascii', 'ignore'); p += ext_len
    orig_size = int.from_bytes(header_full[p:p+4], 'big')

    # 3) baca ciphertext sebanyak orig_size bytes
    need_total_chunks = (need_header + orig_size) * 4
    while len(chunks) < need_total_chunks:
        idx = len(chunks)
        if idx >= len(chans):
            raise ValueError("Data tidak lengkap (cipher terpotong).")
        chunks.append(chans[idx] & 0b11)

    full_payload = _chunks2_to_bytes(chunks)[:need_header + orig_size]
    # potong lagi: header + cipher
    cipher = full_payload[need_header:need_header+orig_size]
    original_bytes = _xor(cipher, key)
    return original_bytes, ext
