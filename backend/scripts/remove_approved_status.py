"""
Remove 'Approved' from reel_status_enum.

PostgreSQL does not support DROP VALUE from an enum directly.
Workaround: rename old type → create new type without Approved →
migrate column → drop old type.
"""
import psycopg2

conn = psycopg2.connect("postgresql://postgres:801007@localhost:5432/reel_cast")
conn.autocommit = False
cur = conn.cursor()

try:
    # 1. Rename existing enum so we can recreate with same name
    cur.execute("ALTER TYPE reel_status_enum RENAME TO reel_status_enum_old")

    # 2. Create new enum without 'Approved'
    cur.execute("""
        CREATE TYPE reel_status_enum AS ENUM (
            'Pending', 'Generating', 'Completed', 'Failed'
        )
    """)

    # 3. Drop default, migrate column, restore default
    cur.execute("ALTER TABLE reels ALTER COLUMN status DROP DEFAULT")
    cur.execute("""
        ALTER TABLE reels
            ALTER COLUMN status TYPE reel_status_enum
            USING status::text::reel_status_enum
    """)
    cur.execute("ALTER TABLE reels ALTER COLUMN status SET DEFAULT 'Pending'")

    # 4. Drop old enum
    cur.execute("DROP TYPE reel_status_enum_old")

    conn.commit()
    print("OK: 'Approved' removed from reel_status_enum")

except Exception as e:
    conn.rollback()
    print("Error (rolled back):", e)
finally:
    cur.close()
    conn.close()
