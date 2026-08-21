"""Dev harness: run a full review against a sample contract and report on it."""
import os, shutil, sys, time
from collections import Counter

sys.path.insert(0, os.path.dirname(__file__) or '.')
from app.database import SessionLocal
from app.models import ContractReview, Playbook
from app.routers.reviews import _run_review

SRC = sys.argv[1] if len(sys.argv) > 1 else '../documents/Box Service Agreement (US) v02092026 with Signature Page (1).docx'
NAME = sys.argv[2] if len(sys.argv) > 2 else 'E2E Box'

os.makedirs('uploads/contracts', exist_ok=True)
dest = f'uploads/contracts/e2e_{abs(hash(NAME))}{os.path.splitext(SRC)[1]}'
shutil.copy(SRC, dest)

db = SessionLocal()
pb = db.query(Playbook).filter(Playbook.is_default.is_(True)).first()
for old in db.query(ContractReview).filter(ContractReview.name == NAME).all():
    db.delete(old)          # per-object so the cascade removes child redlines
db.commit()
rv = ContractReview(playbook_id=pb.id, name=NAME, counterparty='Test',
                    file_name=os.path.basename(SRC), file_path=dest,
                    doc_kind=os.path.splitext(SRC)[1].lstrip('.'))
db.add(rv); db.commit(); db.refresh(rv)
rid = rv.id
db.close()

t = time.time()
_run_review(rid)

db = SessionLocal()
rv = db.get(ContractReview, rid)
print(f'status={rv.status} elapsed={time.time()-t:.0f}s '
      f'total={rv.total_clauses} analyzed={rv.analyzed_count} rows={len(rv.redlines)}')
if rv.error_message:
    print('ERROR:', rv.error_message)
print(Counter(r.classification for r in rv.redlines))

blocks = {}
for r in rv.redlines:
    if r.block_start is not None:
        blocks.setdefault(r.block_start, []).append(r.id)
clashes = {k: v for k, v in blocks.items() if len(v) > 1}
print('blocks with >1 finding:', clashes or 'none')
