"""Add 'Approved' value to reel_status_enum in PostgreSQL."""
import psycopg2

conn = psycopg2.connect("postgresql://postgres:801007@localhost:5432/reel_cast")
conn.autocommit = True
cur = conn.cursor()
try:
    cur.execute("ALTER TYPE reel_status_enum ADD VALUE IF NOT EXISTS 'Approved'")
    print("OK: 'Approved' added to reel_status_enum")
except Exception as e:
    print("Error:", e)
finally:
    cur.close()
    conn.close()
