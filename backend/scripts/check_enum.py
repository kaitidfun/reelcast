import psycopg2
conn = psycopg2.connect("postgresql://postgres:801007@localhost:5432/reel_cast")
cur = conn.cursor()
cur.execute("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'reel_status_enum' ORDER BY enumsortorder")
print("reel_status_enum:", [r[0] for r in cur.fetchall()])
cur.close(); conn.close()
