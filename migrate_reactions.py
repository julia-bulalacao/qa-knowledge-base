import psycopg2
import os

conn = psycopg2.connect(os.environ.get('DATABASE_URL', 
    'postgresql://neondb_owner:npg_2qYfetQ5CXHI@ep-rapid-tooth-anppfgcw-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'))
cur = conn.cursor()

# Check existing columns
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='article'")
cols = [r[0] for r in cur.fetchall()]
print("Existing columns:", cols)

# Add missing columns
for col, definition in [
    ('reaction_yes', 'INTEGER DEFAULT 0'),
    ('reaction_no', 'INTEGER DEFAULT 0'),
]:
    if col not in cols:
        cur.execute(f'ALTER TABLE article ADD COLUMN {col} {definition}')
        print(f"Added: {col}")
    else:
        print(f"Already exists: {col}")

conn.commit()
conn.close()
print("Migration done!")
