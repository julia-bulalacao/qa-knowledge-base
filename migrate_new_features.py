import psycopg2

conn = psycopg2.connect('postgresql://neondb_owner:npg_2qYfetQ5CXHI@ep-rapid-tooth-anppfgcw-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require')
cur = conn.cursor()

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='article'")
cols = [r[0] for r in cur.fetchall()]
print("Current columns:", cols)

migrations = [
    ('visibility', "VARCHAR(200) DEFAULT 'all'"),
    ('review_due', 'TIMESTAMP'),
    ('review_interval_days', 'INTEGER DEFAULT 180'),
]

for col, definition in migrations:
    if col not in cols:
        cur.execute(f'ALTER TABLE article ADD COLUMN {col} {definition}')
        print(f"Added: {col}")
    else:
        print(f"Already exists: {col}")

conn.commit()
conn.close()
print("Migration done!")
