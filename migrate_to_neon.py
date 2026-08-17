import sys
import os
from database import engine as local_engine, Base
from models import Component, Operator, Board, ProductionLog, PhysicalBoard, TestReport
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def migrate(neon_url: str):
    if neon_url.startswith("postgres://"):
        neon_url = neon_url.replace("postgres://", "postgresql://", 1)

    print("🔌 Connecting to local database and Neon.tech database...")
    LocalSession = sessionmaker(bind=local_engine)
    local_db = LocalSession()

    neon_engine = create_engine(neon_url, pool_pre_ping=True)
    
    print("🛠️ Creating tables in Neon database schema...")
    Base.metadata.create_all(bind=neon_engine)

    NeonSession = sessionmaker(bind=neon_engine)
    neon_db = NeonSession()

    # 1. Operators
    operators = local_db.query(Operator).all()
    print(f"📦 Migrating {len(operators)} operators...")
    for op in operators:
        local_db.expunge(op)
        neon_db.merge(op)
    neon_db.commit()

    # 2. Components
    components = local_db.query(Component).all()
    print(f"📦 Migrating {len(components)} components...")
    for comp in components:
        local_db.expunge(comp)
        neon_db.merge(comp)
    neon_db.commit()

    # 3. Boards
    boards = local_db.query(Board).all()
    print(f"📦 Migrating {len(boards)} boards...")
    for b in boards:
        local_db.expunge(b)
        neon_db.merge(b)
    neon_db.commit()

    # 4. Production Logs
    p_logs = local_db.query(ProductionLog).all()
    print(f"📦 Migrating {len(p_logs)} production logs...")
    for log in p_logs:
        local_db.expunge(log)
        neon_db.merge(log)
    neon_db.commit()

    # 5. Physical Boards
    p_boards = local_db.query(PhysicalBoard).all()
    print(f"📦 Migrating {len(p_boards)} physical boards...")
    for pb in p_boards:
        local_db.expunge(pb)
        neon_db.merge(pb)
    neon_db.commit()

    # 6. Test Reports
    reports = local_db.query(TestReport).all()
    print(f"📦 Migrating {len(reports)} test reports...")
    for r in reports:
        local_db.expunge(r)
        neon_db.merge(r)
    neon_db.commit()

    print("🎉 All local data successfully migrated to Neon.tech database!")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        neon_env = os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL")
        if neon_env and "neon.tech" in neon_env:
            migrate(neon_env)
        else:
            print("Usage: python migrate_to_neon.py 'postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require'")
            sys.exit(1)
    else:
        migrate(sys.argv[1])
