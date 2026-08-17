from datetime import datetime
from typing import Optional, List, Any
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, func, Index, JSON
from sqlalchemy.orm import relationship

from pydantic import BaseModel, Field, ConfigDict
from database import Base

# ==========================================
# SQLAlchemy Models
# ==========================================

class Component(Base):
    __tablename__ = "components"

    id = Column(Integer, primary_key=True, index=True)
    part_number = Column(String(100), unique=True, nullable=False, index=True)
    type = Column(String(100), nullable=True)
    footprint = Column(String(100), nullable=True)
    current_stock = Column(Integer, nullable=False, default=0)
    minimum_threshold = Column(Integer, nullable=False, default=0)
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Operator(Base):
    __tablename__ = "operators"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(150), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(150), unique=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="operator")
    operator_id = Column(Integer, ForeignKey("operators.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    operator = relationship("Operator", lazy="joined")


class Board(Base):
    __tablename__ = "boards"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False, index=True)
    production_line_category = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ProductionLog(Base):
    __tablename__ = "production_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    operator_id = Column(Integer, ForeignKey("operators.id", ondelete="SET NULL"), nullable=True)
    production_line = Column(String(100), nullable=True, default="MACHINECRAFT JACQUARD")
    board_type_id = Column(Integer, ForeignKey("boards.id", ondelete="SET NULL"), nullable=True)
    previous_stage = Column(String(100), nullable=True, default="Start")
    current_stage = Column(String(100), nullable=True, default="SMD Pick and Place")




    quantity = Column(Integer, nullable=False, default=1)

    # Relationships
    operator = relationship("Operator", lazy="joined")
    board = relationship("Board", lazy="joined")


class PhysicalBoard(Base):
    __tablename__ = "physical_boards"

    serial_number = Column(String(100), primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("boards.id", ondelete="CASCADE"), nullable=False)
    manufactured_date = Column(DateTime(timezone=True), server_default=func.now())
    current_status = Column(String(50), nullable=False, default="IN_TESTING")

    # Relationships
    board = relationship("Board", lazy="joined")


class TestReport(Base):
    __tablename__ = "test_reports"

    id = Column(Integer, primary_key=True, index=True)
    board_serial_number = Column(String(100), ForeignKey("physical_boards.serial_number", ondelete="CASCADE"), nullable=False)
    test_type = Column(String(100), nullable=False, index=True)
    operator_id = Column(Integer, ForeignKey("operators.id", ondelete="SET NULL"), nullable=True)
    test_timestamp = Column(DateTime(timezone=True), server_default=func.now())
    overall_status = Column(String(20), nullable=False, default="PASS")
    test_data = Column(JSON, nullable=False)
    remarks = Column(Text, nullable=True)

    # Relationships
    physical_board = relationship("PhysicalBoard", lazy="joined")
    operator = relationship("Operator", lazy="joined")

    __table_args__ = (
        Index("idx_test_data", "test_data", postgresql_using="gin"),
    )



# ==========================================
# Pydantic Schemas
# ==========================================

# Component Schemas
class ComponentBase(BaseModel):
    part_number: str = Field(..., description="Unique component part number")
    type: Optional[str] = Field(None, description="Component type e.g. Resistor, IC")
    footprint: Optional[str] = Field(None, description="Package footprint e.g. 0805, QFN32")
    current_stock: int = Field(0, ge=0, description="Current available stock quantity")
    minimum_threshold: int = Field(0, ge=0, description="Low stock warning threshold")
    comments: Optional[str] = Field(None, description="Additional notes or description")

class ComponentCreate(ComponentBase):
    pass

class ComponentUpdate(BaseModel):
    type: Optional[str] = None
    footprint: Optional[str] = None
    current_stock: Optional[int] = Field(None, ge=0)
    minimum_threshold: Optional[int] = Field(None, ge=0)
    comments: Optional[str] = None

class ComponentResponse(ComponentBase):
    id: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Operator Schemas
class OperatorBase(BaseModel):
    name: str = Field(..., description="Staff operator full name")
    email: Optional[str] = Field(None, description="Optional email address")
    is_active: bool = Field(True, description="Active status flag")

class OperatorCreate(OperatorBase):
    pass

class OperatorUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None

class OperatorResponse(OperatorBase):
    id: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Board Schemas
class BoardBase(BaseModel):
    name: str = Field(..., description="Product board name e.g. MNT CLCard Even 🟢")
    production_line_category: Optional[str] = Field(None, description="Production line category e.g. 35, 25")

class BoardCreate(BoardBase):
    pass

class BoardUpdate(BaseModel):
    name: Optional[str] = None
    production_line_category: Optional[str] = None

class BoardResponse(BoardBase):
    id: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# Production Log Schemas
class ProductionLogCreate(BaseModel):
    operator_id: int = Field(..., description="ID of staff operator")
    production_line: Optional[str] = Field("MACHINECRAFT JACQUARD", description="Production line name")
    board_type_id: int = Field(..., description="ID of product board")


    previous_stage: Optional[str] = Field("Start", description="Previous manufacturing stage")
    current_stage: Optional[str] = Field("SMD Pick and Place", description="Current manufacturing stage")
    quantity: int = Field(..., gt=0, description="Quantity produced/processed in this stage")

class ProductionLogResponse(BaseModel):
    id: int
    timestamp: Optional[datetime] = None
    operator_id: Optional[int] = None
    operator_name: Optional[str] = None
    production_line: Optional[str] = None
    board_type_id: Optional[int] = None
    board_name: Optional[str] = None
    previous_stage: Optional[str] = None
    current_stage: Optional[str] = None
    quantity: int

    model_config = ConfigDict(from_attributes=True)


# Physical Board Schemas
class PhysicalBoardCreate(BaseModel):
    serial_number: str = Field(..., description="Unique physical board serial number")
    product_id: int = Field(..., description="Board product model ID")
    current_status: Optional[str] = Field("IN_TESTING", description="Current board status e.g. IN_TESTING, PASSED, REJECTED")

class PhysicalBoardResponse(BaseModel):
    serial_number: str
    product_id: int
    product_name: Optional[str] = None
    manufactured_date: Optional[datetime] = None
    current_status: str

    model_config = ConfigDict(from_attributes=True)


# Test Report Schemas
class TestReportCreate(BaseModel):
    board_serial_number: str = Field(..., description="Physical board serial number")
    product_id: Optional[int] = Field(None, description="Product board model ID for auto-registration")
    test_type: str = Field(..., description="Test type name e.g. 8_HOURS_ON_OFF, SECO_BOARD_QA, DISPLAY_UNIT_QA")
    operator_id: int = Field(..., description="ID of staff operator conducting the test")
    overall_status: str = Field("PASS", description="Overall test outcome: PASS or FAIL")
    test_data: dict = Field(..., description="JSON test measurements and metrics dictionary")
    remarks: Optional[str] = Field(None, description="Optional technician remarks or observations")


class TestReportResponse(BaseModel):
    id: int
    board_serial_number: str
    product_name: Optional[str] = None
    test_type: str
    operator_id: Optional[int] = None
    operator_name: Optional[str] = None
    test_timestamp: Optional[datetime] = None
    overall_status: str
    test_data: dict
    remarks: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# User Schemas
class UserCreate(BaseModel):
    username: str = Field(..., description="Unique username")
    email: Optional[str] = Field(None, description="Optional email address")
    password: str = Field(..., min_length=4, description="Password")
    role: Optional[str] = Field("operator", description="Role: admin, operator, or tester")
    operator_id: Optional[int] = Field(None, description="Link to Operator staff ID")

class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    role: str
    operator_id: Optional[int] = None
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

