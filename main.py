import os
from typing import List, Optional
from datetime import datetime, date
from fastapi import FastAPI, Depends, HTTPException, status, Query

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, func

from database import engine, Base, get_db
import models
import auth
from fastapi.security import OAuth2PasswordBearer

app = FastAPI(
    title="Machinecraft Jacquard Production & Inventory API",
    description="API for component inventory tracking, operators, product boards, and production stage tracking",
    version="2.0.0",
)

# Security & CORS configuration
raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response


# Automatically seed default operators, boards, and admin user if tables are empty
def seed_default_data():
    try:
        db = next(get_db())
        mctracker_user = db.query(models.User).filter(models.User.username == "mctracker").first()
        if not mctracker_user:
            legacy_admin = db.query(models.User).filter(models.User.username == "admin").first()
            if legacy_admin:
                legacy_admin.username = "mctracker"
                legacy_admin.hashed_password = auth.get_password_hash("2008batch")
                db.commit()
                print("👤 Updated legacy admin user to (username: mctracker, password: 2008batch)")
            else:
                mctracker_user = models.User(
                    username="mctracker",
                    email="admin@machinecraft.com",
                    hashed_password=auth.get_password_hash("2008batch"),
                    role="admin",
                    is_active=True
                )
                db.add(mctracker_user)
                db.commit()
                print("👤 Default admin user created (username: mctracker, password: 2008batch)")
        else:
            mctracker_user.hashed_password = auth.get_password_hash("2008batch")
            db.commit()
            print("👤 Default admin user verified (username: mctracker, password: 2008batch)")

        if db.query(models.Operator).count() == 0:
            default_operators = [
                models.Operator(name="DilliBabu", email="dillibabu@machinecraft.com", is_active=True),
            ]
            db.add_all(default_operators)
            db.commit()

        if db.query(models.Board).count() == 0:
            default_boards = [
                models.Board(name="1PHASE BOARD", production_line_category="MACHINECRAFT JACQUARD"),
            ]
            db.add_all(default_boards)
            db.commit()
    except Exception as e:
        print("Seed data check warning:", e)

@app.on_event("startup")
def startup_db_init():
    try:
        Base.metadata.create_all(bind=engine)
        seed_default_data()
        print("✅ Database tables verified and initial data seeded.")
    except Exception as e:
        print(f"⚠️ Warning: Could not connect to database on startup: {e}")


# Serve static web dashboard and mobile PWA files
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/", tags=["Dashboard"])
def read_root():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {
        "message": "Welcome to Machinecraft Production & Inventory API",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health", tags=["Health"])
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database connection error: {str(e)}"
        )

@app.get("/dashboard", tags=["Dashboard"])
def read_dashboard():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Dashboard UI not found")

@app.get("/operator", tags=["Operator PWA"])
def read_operator_pwa():
    pwa_file = os.path.join(static_dir, "operator", "index.html")
    if os.path.exists(pwa_file):
        return FileResponse(pwa_file)
    raise HTTPException(status_code=404, detail="Operator PWA UI not found")

@app.get("/testing", tags=["Testing PWA"])
def read_testing_pwa():
    pwa_file = os.path.join(static_dir, "testing", "index.html")
    if os.path.exists(pwa_file):
        return FileResponse(pwa_file)
    raise HTTPException(status_code=404, detail="Testing PWA UI not found")


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[models.User]:
    if not token:
        return None
    payload = auth.decode_token(token)
    if not payload or "sub" not in payload:
        return None
    username = payload["sub"]
    user = db.query(models.User).filter(models.User.username == username, models.User.is_active == True).first()
    return user

def require_user(user: Optional[models.User] = Depends(get_current_user)) -> models.User:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# ==========================================
# Authentication Endpoints
# ==========================================

@app.post("/api/auth/login", response_model=models.TokenResponse, tags=["Authentication"])
def login(payload: models.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username.strip()).first()
    if not user or not auth.verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is disabled")

    access_token = auth.create_access_token(data={"sub": user.username, "role": user.role})
    return models.TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=models.UserResponse.model_validate(user)
    )

@app.get("/api/auth/me", response_model=models.UserResponse, tags=["Authentication"])
def get_me(current_user: models.User = Depends(require_user)):
    return models.UserResponse.model_validate(current_user)

@app.get("/api/auth/users", response_model=List[models.UserResponse], tags=["Authentication"])
def get_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user)
):
    return db.query(models.User).order_by(models.User.username.asc()).all()

@app.post("/api/auth/users", response_model=models.UserResponse, status_code=status.HTTP_201_CREATED, tags=["Authentication"])
def create_user(
    payload: models.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can create new user accounts")
    
    existing = db.query(models.User).filter(models.User.username == payload.username.strip()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Username '{payload.username}' already exists")
    
    new_user = models.User(
        username=payload.username.strip(),
        email=payload.email.strip() if payload.email else None,
        hashed_password=auth.get_password_hash(payload.password),
        role=payload.role or "operator",
        operator_id=payload.operator_id,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return models.UserResponse.model_validate(new_user)


# ==========================================
# Components Endpoints
# ==========================================

@app.get("/api/components", response_model=List[models.ComponentResponse], tags=["Components"])
def get_components(
    type: Optional[str] = Query(None, description="Filter by component type"),
    low_stock: Optional[bool] = Query(False, description="Filter components where current_stock <= minimum_threshold"),
    db: Session = Depends(get_db)
):
    query = db.query(models.Component)
    if type:
        query = query.filter(models.Component.type.ilike(f"%{type}%"))
    if low_stock:
        query = query.filter(models.Component.current_stock <= models.Component.minimum_threshold)
    return query.all()


@app.post("/api/components", response_model=models.ComponentResponse, status_code=status.HTTP_201_CREATED, tags=["Components"])
def create_component(
    component_in: models.ComponentCreate,
    db: Session = Depends(get_db)
):
    existing = db.query(models.Component).filter(
        models.Component.part_number == component_in.part_number
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Component with part_number '{component_in.part_number}' already exists."
        )
    component = models.Component(**component_in.model_dump())
    db.add(component)
    db.commit()
    db.refresh(component)
    return component


@app.get("/api/components/{part_number}", response_model=models.ComponentResponse, tags=["Components"])
def get_component_by_part_number(
    part_number: str,
    db: Session = Depends(get_db)
):
    component = db.query(models.Component).filter(
        models.Component.part_number == part_number
    ).first()
    if not component:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Component '{part_number}' not found."
        )
    return component


@app.put("/api/components/{part_number}", response_model=models.ComponentResponse, tags=["Components"])
def update_component(
    part_number: str,
    component_in: models.ComponentUpdate,
    db: Session = Depends(get_db)
):
    component = db.query(models.Component).filter(
        models.Component.part_number == part_number
    ).first()
    if not component:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Component '{part_number}' not found."
        )
    update_data = component_in.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(component, field, val)
    db.commit()
    db.refresh(component)
    return component


@app.delete("/api/components/{part_number}", status_code=status.HTTP_204_NO_CONTENT, tags=["Components"])
def delete_component(
    part_number: str,
    db: Session = Depends(get_db)
):
    component = db.query(models.Component).filter(
        models.Component.part_number == part_number
    ).first()
    if not component:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Component '{part_number}' not found."
        )
    db.delete(component)
    db.commit()
    return None


# ==========================================
# Operators Endpoints
# ==========================================

@app.get("/api/operators", response_model=List[models.OperatorResponse], tags=["Operators"])
def get_operators(
    active_only: bool = Query(True, description="Return active operators only"),
    db: Session = Depends(get_db)
):
    query = db.query(models.Operator)
    if active_only:
        query = query.filter(models.Operator.is_active == True)
    return query.order_by(models.Operator.name.asc()).all()


@app.post("/api/operators", response_model=models.OperatorResponse, status_code=status.HTTP_201_CREATED, tags=["Operators"])
def create_operator(
    operator_in: models.OperatorCreate,
    db: Session = Depends(get_db)
):
    existing = db.query(models.Operator).filter(
        models.Operator.name.ilike(operator_in.name)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Operator '{operator_in.name}' already exists."
        )
    operator = models.Operator(**operator_in.model_dump())
    db.add(operator)
    db.commit()
    db.refresh(operator)
    return operator


@app.put("/api/operators/{operator_id}", response_model=models.OperatorResponse, tags=["Operators"])
def update_operator(
    operator_id: int,
    operator_in: models.OperatorUpdate,
    db: Session = Depends(get_db)
):
    operator = db.query(models.Operator).filter(models.Operator.id == operator_id).first()
    if not operator:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operator not found")
    update_data = operator_in.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(operator, field, val)
    db.commit()
    db.refresh(operator)
    return operator


# ==========================================
# Boards Endpoints
# ==========================================

@app.get("/api/boards", response_model=List[models.BoardResponse], tags=["Boards"])
def get_boards(db: Session = Depends(get_db)):
    return db.query(models.Board).order_by(models.Board.name.asc()).all()


@app.post("/api/boards", response_model=models.BoardResponse, status_code=status.HTTP_201_CREATED, tags=["Boards"])
def create_board(
    board_in: models.BoardCreate,
    db: Session = Depends(get_db)
):
    existing = db.query(models.Board).filter(models.Board.name.ilike(board_in.name)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Board '{board_in.name}' already exists.")
    board = models.Board(**board_in.model_dump())
    db.add(board)
    db.commit()
    db.refresh(board)
    return board


@app.put("/api/boards/{board_id}", response_model=models.BoardResponse, tags=["Boards"])
def update_board(
    board_id: int,
    board_in: models.BoardUpdate,
    db: Session = Depends(get_db)
):
    board = db.query(models.Board).filter(models.Board.id == board_id).first()
    if not board:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
    update_data = board_in.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(board, field, val)
    db.commit()
    db.refresh(board)
    return board


# ==========================================
# Production Stage Tracking Endpoints
# ==========================================

@app.post("/api/production/log", status_code=status.HTTP_201_CREATED, tags=["Production Tracking"])
def create_production_log(
    payload: models.ProductionLogCreate,
    db: Session = Depends(get_db)
):
    operator = db.query(models.Operator).filter(models.Operator.id == payload.operator_id).first()
    if not operator:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Operator ID {payload.operator_id} not found.")

    board = db.query(models.Board).filter(models.Board.id == payload.board_type_id).first()
    if not board:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Board ID {payload.board_type_id} not found.")

    previous_stage = (payload.previous_stage or "Start").strip()
    current_stage = (payload.current_stage or "SMD Pick and Place").strip()

    # If previous_stage is NOT "Start", check available quantity at previous_stage
    if previous_stage.lower() != "start":
        additions = db.query(func.sum(models.ProductionLog.quantity)).filter(
            models.ProductionLog.board_type_id == payload.board_type_id,
            models.ProductionLog.current_stage == previous_stage
        ).scalar() or 0

        deductions = db.query(func.sum(models.ProductionLog.quantity)).filter(
            models.ProductionLog.board_type_id == payload.board_type_id,
            models.ProductionLog.previous_stage == previous_stage
        ).scalar() or 0

        available_qty = additions - deductions

        if available_qty < payload.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot move stage: Insufficient stock at stage '{previous_stage}' for product '{board.name}'. Available: {available_qty} units, requested: {payload.quantity} units."
            )

    log_entry = models.ProductionLog(
        operator_id=payload.operator_id,
        production_line=payload.production_line or "MACHINECRAFT JACQUARD",
        board_type_id=payload.board_type_id,
        previous_stage=previous_stage,
        current_stage=current_stage,
        quantity=payload.quantity
    )

    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)

    return {
        "status": "success",
        "message": f"Successfully moved {payload.quantity} units of {board.name} from {previous_stage} to {current_stage} by {operator.name}.",
        "id": log_entry.id
    }



@app.get("/api/production/logs", response_model=List[models.ProductionLogResponse], tags=["Production Tracking"])
def get_production_logs(
    limit: int = Query(100, ge=1, le=1000),
    log_date: Optional[str] = Query(None, alias="date", description="Filter by YYYY-MM-DD date"),
    db: Session = Depends(get_db)
):
    query = db.query(models.ProductionLog)
    if log_date:
        try:
            target_date = datetime.strptime(log_date.strip(), "%Y-%m-%d").date()
            query = query.filter(func.date(models.ProductionLog.timestamp) == target_date)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Expected YYYY-MM-DD.")
    logs = query.order_by(models.ProductionLog.timestamp.desc()).limit(limit).all()
    
    result = []
    for log in logs:
        result.append(models.ProductionLogResponse(
            id=log.id,
            timestamp=log.timestamp,
            operator_id=log.operator_id,
            operator_name=log.operator.name if log.operator else "Unknown Operator",
            production_line=log.production_line,
            board_type_id=log.board_type_id,
            board_name=log.board.name if log.board else "Unknown Board",
            previous_stage=log.previous_stage,
            current_stage=log.current_stage,
            quantity=log.quantity
        ))
    return result


@app.delete("/api/production/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Production Tracking"])
def delete_production_log(
    log_id: int,
    db: Session = Depends(get_db)
):
    log_entry = db.query(models.ProductionLog).filter(models.ProductionLog.id == log_id).first()
    if not log_entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Production log #{log_id} not found.")
    
    db.delete(log_entry)
    db.commit()
    return None



@app.get("/api/production/stage-stock", tags=["Production Tracking"])
def get_stage_stock(
    board_type_id: Optional[int] = Query(None, description="Filter by board ID"),
    db: Session = Depends(get_db)
):
    query = db.query(models.ProductionLog)
    if board_type_id:
        query = query.filter(models.ProductionLog.board_type_id == board_type_id)
    all_logs = query.all()

    stock_map = {}
    for log in all_logs:
        b_id = log.board_type_id
        if log.current_stage:
            k_curr = (b_id, log.current_stage)
            stock_map[k_curr] = stock_map.get(k_curr, 0) + log.quantity

        if log.previous_stage and log.previous_stage.strip().lower() != "start":
            k_prev = (b_id, log.previous_stage)
            stock_map[k_prev] = stock_map.get(k_prev, 0) - log.quantity

    result = []
    for (b_id, stage), qty in stock_map.items():
        if qty != 0:
            board = db.query(models.Board).filter(models.Board.id == b_id).first()
            result.append({
                "board_id": b_id,
                "board_name": board.name if board else "Unknown Board",
                "stage": stage,
                "available_quantity": qty
            })
    return result


PRODUCTION_STAGES = [
    "Empty Board",
    "SMD Pick and Place",
    "Con. Pin Soldering",
    "Con. Dip Soldering",
    "Cleaning",
    "Testing",
    "Stock",
    "Delivery"
]

@app.get("/api/production/stage-matrix", tags=["Production Tracking"])
def get_stage_matrix(
    production_line: Optional[str] = Query(None, description="Filter by production line category"),
    db: Session = Depends(get_db)
):
    query = db.query(models.Board)
    if production_line:
        query = query.filter(models.Board.production_line_category == production_line)
    boards = query.order_by(models.Board.name.asc()).all()

    matrix = []
    for board in boards:
        additions_rows = db.query(
            models.ProductionLog.current_stage,
            func.sum(models.ProductionLog.quantity)
        ).filter(
            models.ProductionLog.board_type_id == board.id
        ).group_by(models.ProductionLog.current_stage).all()
        additions = {stage: qty for stage, qty in additions_rows if stage}

        deductions_rows = db.query(
            models.ProductionLog.previous_stage,
            func.sum(models.ProductionLog.quantity)
        ).filter(
            models.ProductionLog.board_type_id == board.id,
            models.ProductionLog.previous_stage.isnot(None)
        ).group_by(models.ProductionLog.previous_stage).all()
        deductions = {stage: qty for stage, qty in deductions_rows if stage and stage.strip().lower() != "start"}

        stage_quantities = {}
        total_wip = 0
        for stage in PRODUCTION_STAGES:
            qty = additions.get(stage, 0) - deductions.get(stage, 0)
            qty = max(0, qty)
            stage_quantities[stage] = qty
            total_wip += qty

        matrix.append({
            "board_id": board.id,
            "board_name": board.name,
            "production_line_category": board.production_line_category,
            "stage_quantities": stage_quantities,
            "total_wip": total_wip
        })

    return {
        "stages": PRODUCTION_STAGES,
        "matrix": matrix
    }


# ==========================================
# Physical Boards & Testing Tracking Endpoints
# ==========================================

@app.post("/api/physical-boards", response_model=models.PhysicalBoardResponse, status_code=status.HTTP_201_CREATED, tags=["Testing Tracking"])
def create_physical_board(
    payload: models.PhysicalBoardCreate,
    db: Session = Depends(get_db)
):
    existing = db.query(models.PhysicalBoard).filter(models.PhysicalBoard.serial_number == payload.serial_number.strip()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Serial number '{payload.serial_number}' is already registered.")

    board = db.query(models.Board).filter(models.Board.id == payload.product_id).first()
    if not board:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Board product ID {payload.product_id} not found.")

    phys_board = models.PhysicalBoard(
        serial_number=payload.serial_number.strip(),
        product_id=payload.product_id,
        current_status=payload.current_status or "IN_TESTING"
    )
    db.add(phys_board)
    db.commit()
    db.refresh(phys_board)

    return models.PhysicalBoardResponse(
        serial_number=phys_board.serial_number,
        product_id=phys_board.product_id,
        product_name=board.name,
        manufactured_date=phys_board.manufactured_date,
        current_status=phys_board.current_status
    )


@app.get("/api/physical-boards", response_model=List[models.PhysicalBoardResponse], tags=["Testing Tracking"])
def get_physical_boards(
    product_id: Optional[int] = Query(None, description="Filter by board product ID"),
    current_status: Optional[str] = Query(None, description="Filter by status e.g. IN_TESTING, PASSED, REJECTED"),
    db: Session = Depends(get_db)
):
    query = db.query(models.PhysicalBoard)
    if product_id:
        query = query.filter(models.PhysicalBoard.product_id == product_id)
    if current_status:
        query = query.filter(models.PhysicalBoard.current_status == current_status)

    boards = query.order_by(models.PhysicalBoard.manufactured_date.desc()).all()
    result = []
    for b in boards:
        result.append(models.PhysicalBoardResponse(
            serial_number=b.serial_number,
            product_id=b.product_id,
            product_name=b.board.name if b.board else "Unknown Board",
            manufactured_date=b.manufactured_date,
            current_status=b.current_status
        ))
    return result


@app.post("/api/testing/log-report", response_model=models.TestReportResponse, status_code=status.HTTP_201_CREATED, tags=["Testing Tracking"])
def create_test_report(
    payload: models.TestReportCreate,
    db: Session = Depends(get_db)
):
    serial_str = payload.board_serial_number.strip()
    if not serial_str:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Board serial number is required.")

    phys_board = db.query(models.PhysicalBoard).filter(models.PhysicalBoard.serial_number == serial_str).first()
    if not phys_board:
        if not payload.product_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Serial number '{serial_str}' is not registered yet. Please select a product board.")
        
        board_model = db.query(models.Board).filter(models.Board.id == payload.product_id).first()
        if not board_model:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Board product ID {payload.product_id} not found.")

        phys_board = models.PhysicalBoard(
            serial_number=serial_str,
            product_id=payload.product_id,
            current_status="IN_TESTING"
        )
        db.add(phys_board)
        db.flush()

    operator = db.query(models.Operator).filter(models.Operator.id == payload.operator_id).first()
    if not operator:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Operator ID {payload.operator_id} not found.")

    overall_status = payload.overall_status.upper().strip()
    if overall_status not in ["PASS", "FAIL", "IN_TESTING"]:
        overall_status = "PASS"

    report = models.TestReport(
        board_serial_number=payload.board_serial_number.strip(),
        test_type=payload.test_type.strip(),
        operator_id=payload.operator_id,
        overall_status=overall_status,
        test_data=payload.test_data,
        remarks=payload.remarks
    )

    if overall_status == "PASS":
        phys_board.current_status = "PASSED"
    elif overall_status == "FAIL":
        phys_board.current_status = "REJECTED"
    elif overall_status == "IN_TESTING":
        phys_board.current_status = "IN_TESTING"


    db.add(report)
    db.commit()
    db.refresh(report)

    return models.TestReportResponse(
        id=report.id,
        board_serial_number=report.board_serial_number,
        product_name=phys_board.board.name if phys_board and phys_board.board else "Unknown Board",
        test_type=report.test_type,
        operator_id=report.operator_id,
        operator_name=operator.name,
        test_timestamp=report.test_timestamp,
        overall_status=report.overall_status,
        test_data=report.test_data,
        remarks=report.remarks
    )


@app.get("/api/testing/reports", response_model=List[models.TestReportResponse], tags=["Testing Tracking"])
def get_test_reports(
    serial_number: Optional[str] = Query(None, description="Filter by board serial number"),
    test_type: Optional[str] = Query(None, description="Filter by test type"),
    overall_status: Optional[str] = Query(None, description="Filter by PASS or FAIL"),
    log_date: Optional[str] = Query(None, alias="date", description="Filter by YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    query = db.query(models.TestReport)
    if serial_number:
        query = query.filter(models.TestReport.board_serial_number == serial_number.strip())
    if test_type:
        query = query.filter(models.TestReport.test_type == test_type.strip())
    if overall_status:
        query = query.filter(models.TestReport.overall_status == overall_status.strip().upper())
    if log_date:
        try:
            target_date = datetime.strptime(log_date.strip(), "%Y-%m-%d").date()
            query = query.filter(func.date(models.TestReport.test_timestamp) == target_date)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Expected YYYY-MM-DD.")

    reports = query.order_by(models.TestReport.test_timestamp.desc()).all()
    result = []
    for r in reports:
        result.append(models.TestReportResponse(
            id=r.id,
            board_serial_number=r.board_serial_number,
            product_name=r.physical_board.board.name if r.physical_board and r.physical_board.board else "Unknown Board",
            test_type=r.test_type,
            operator_id=r.operator_id,
            operator_name=r.operator.name if r.operator else "Unknown Operator",
            test_timestamp=r.test_timestamp,
            overall_status=r.overall_status,
            test_data=r.test_data,
            remarks=r.remarks
        ))
    return result


@app.delete("/api/testing/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Testing Tracking"])
def delete_test_report(
    report_id: int,
    db: Session = Depends(get_db)
):
    report = db.query(models.TestReport).filter(models.TestReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Test report #{report_id} not found.")

    db.delete(report)
    db.commit()
    return None



