import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from database.models import Base

DATABASE_PATH = os.environ.get("ROADWATCH_DB_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "roadwatch.db"))
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False
)

SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db_session = scoped_session(SessionFactory)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionFactory()
    try:
        yield db
    finally:
        db.close()
