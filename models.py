from datetime import datetime
from typing import Optional, List, Any
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, func
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
