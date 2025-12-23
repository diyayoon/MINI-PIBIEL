import sqlite3
import hashlib

DB_NAME = "stego.db"


def get_connection():
    return sqlite3.connect(DB_NAME)


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS stego_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id TEXT,
            original_path TEXT,
            cover_path TEXT,
            stego_path TEXT,
            extracted_path TEXT,
            secret_hash TEXT,
            action TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()


def hash_secret(secret):
    return hashlib.sha256(secret.encode()).hexdigest()


def insert_log(
    file_id,
    action,
    original_path=None,
    cover_path=None,
    stego_path=None,
    extracted_path=None,
    secret_hash=None
):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO stego_logs
        (file_id, original_path, cover_path, stego_path,
         extracted_path, secret_hash, action)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        file_id,
        original_path,
        cover_path,
        stego_path,
        extracted_path,
        secret_hash,
        action
    ))

    conn.commit()
    conn.close()
