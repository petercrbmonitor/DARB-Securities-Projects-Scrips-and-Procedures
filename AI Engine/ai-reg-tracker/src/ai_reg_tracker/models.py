"""Schema for a single regulation record.

This pydantic model IS the schema. Every file in data/regulations/*.yaml is
validated against it. Change the schema here, not in scattered scripts.
"""
from __future__ import annotations

from datetime import date
from enum import Enum

from pydantic import BaseModel, Field, HttpUrl, field_validator

# The AI System Register field groups this tracker feeds (see data/field_groups.yaml).
FIELD_GROUPS = {"A", "B", "C", "D", "E", "F", "G", "H"}


class Jurisdiction(str, Enum):
    GLOBAL = "Global"
    EU = "EU"
    US = "US"
    UK = "UK"
    FR = "FR"
    SG = "SG"
    OTHER = "Other"


class RegimeType(str, Enum):
    HARD_LAW = "hard_law"          # binding statute / regulation
    SUPERVISORY = "supervisory"    # supervisory expectation / guidance
    VOLUNTARY = "voluntary"        # voluntary standard / framework
    CONSULTATION = "consultation"  # draft / consultation
    ANALYTICAL = "analytical"      # standard-setter analysis, not a rule


class Domain(str, Enum):
    CROSS_SECTOR = "cross_sector"
    BANKING_PRUDENTIAL = "banking_prudential"
    MARKETS_CONDUCT = "markets_conduct"
    ACCOUNTING = "accounting"
    CONSUMER_CREDIT = "consumer_credit"
    CRYPTO = "crypto"
    CORPORATE_CONDUCT = "corporate_conduct"
    AML = "aml"
    DATA_GOVERNANCE = "data_governance"


class Status(str, Enum):
    IN_FORCE = "in_force"
    PROPOSED = "proposed"
    PROVISIONAL = "provisional"   # provisional/political agreement, not yet adopted
    CONSULTATION = "consultation"
    WITHDRAWN = "withdrawn"
    FINAL_GUIDANCE = "final_guidance"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Deadline(BaseModel):
    date: date
    note: str


class Dates(BaseModel):
    published: date | None = None
    effective: date | None = None
    deadlines: list[Deadline] = Field(default_factory=list)
    last_reviewed: date


class ChangeEntry(BaseModel):
    date: date
    change: str
    by: str


class Regulation(BaseModel):
    id: str = Field(description="stable slug, e.g. 'eu-ai-act'")
    name: str
    body: str
    jurisdiction: Jurisdiction
    regime_type: RegimeType
    domain: list[Domain] = Field(min_length=1)
    status: Status
    dates: Dates
    applies_to: list[str] = Field(default_factory=list)
    # Which AI System Register field groups this regulation drives. May be empty
    # for adjacent (e.g. DARB-side capital) regs that don't map to the AI register.
    field_groups: list[str] = Field(default_factory=list)
    summary: str = Field(description="YOUR words. Never paste regulator text.")
    source_urls: list[HttpUrl] = Field(min_length=1)
    confidence: Confidence
    reviewer: str
    methodology_version: str
    ai_assisted: bool = False
    changelog: list[ChangeEntry] = Field(default_factory=list)
    related: list[str] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not v or not all(c.islower() or c.isdigit() or c == "-" for c in v):
            raise ValueError(f"id must be a lowercase-hyphen slug, got {v!r}")
        return v

    @field_validator("field_groups")
    @classmethod
    def _groups(cls, v: list[str]) -> list[str]:
        bad = [g for g in v if g not in FIELD_GROUPS]
        if bad:
            raise ValueError(f"unknown field_groups {bad}; allowed {sorted(FIELD_GROUPS)}")
        return v

    @field_validator("summary")
    @classmethod
    def _summary_len(cls, v: str) -> str:
        # Copyright guard: a summary should be a paraphrase, not pasted text.
        if len(v.split()) > 150:
            raise ValueError("summary too long (>150 words) - paraphrase, do not paste source text")
        return v
