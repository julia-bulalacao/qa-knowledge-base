"""
Migration: create role_category_access table.

Supports both PostgreSQL (DATABASE_URL env var) and local SQLite.
Safe to run multiple times (CREATE TABLE IF NOT EXISTS).
"""
import os
import sys

DATABASE_URL = os.environ.get('DATABASE_URL', '')

PG_DDL = """
CREATE TABLE IF NOT EXISTS role_category_access (
    id          SERIAL PRIMARY KEY,
    role_id     INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
    UNIQUE (role_id, category_id)
)
"""

SQLITE_DDL = """
CREATE TABLE IF NOT EXISTS role_category_access (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id     INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
    UNIQUE (role_id, category_id)
)
"""

if DATABASE_URL:
    try:
        import psycopg2
    except ImportError:
        print("psycopg2 not installed. Run: pip install psycopg2-binary")
        sys.exit(1)

    if DATABASE_URL.startswith('postgres://'):
        DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()
    cur.execute(PG_DDL)
    conn.commit()
    conn.close()
    print("PostgreSQL: role_category_access table created/verified.")
else:
    import sqlite3

    db_path = os.path.join(os.path.dirname(__file__), 'backend', 'instance', 'wiki.db')
    if not os.path.exists(db_path):
        print(f"SQLite DB not found at: {db_path}")
        print("Start the app once first so Flask creates the DB, then re-run this script.")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    cur  = conn.cursor()
    cur.execute(SQLITE_DDL)
    conn.commit()
    conn.close()
    print(f"SQLite: role_category_access table created/verified at {db_path}")

print("Migration done!")
