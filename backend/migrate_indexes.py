"""
Run this once to add performance indexes to the database.
Usage: python migrate_indexes.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from extensions import db
from sqlalchemy import text

app = create_app()

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_article_status ON article(status)",
    "CREATE INDEX IF NOT EXISTS idx_article_category ON article(category_id)",
    "CREATE INDEX IF NOT EXISTS idx_article_author ON article(author_id)",
    "CREATE INDEX IF NOT EXISTS idx_article_updated ON article(updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_article_pinned ON article(is_pinned)",
    "CREATE INDEX IF NOT EXISTS idx_article_status_cat ON article(status, category_id)",
    "CREATE INDEX IF NOT EXISTS idx_comment_article ON comment(article_id)",
    "CREATE INDEX IF NOT EXISTS idx_user_role ON \"user\"(role)",
    "CREATE INDEX IF NOT EXISTS idx_article_tag ON article_tags(article_id)",
]

with app.app_context():
    with db.engine.connect() as conn:
        for idx_sql in INDEXES:
            try:
                conn.execute(text(idx_sql))
                print(f"✅ {idx_sql.split('idx_')[1].split(' ')[0]}")
            except Exception as e:
                print(f"⚠️  {e}")
        conn.commit()
    print("\n✅ All indexes created!")
