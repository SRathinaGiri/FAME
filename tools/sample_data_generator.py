#!/usr/bin/env python3
"""
F.A.M.E sample data generator.

Creates a schema-v11 backup JSON for a sample Indian electronics trading
company. Run without arguments for the Tkinter UI, or use --no-gui for CLI.

Optional dependencies:
  pip install faker cryptography
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import random
import string
import sys
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from tkinter import BooleanVar, IntVar, StringVar, Tk, filedialog, messagebox, ttk

try:
    from faker import Faker
except Exception:  # pragma: no cover - fallback for machines without Faker
    Faker = None

SCHEMA_VERSION = 11
APP_NAME = "F.A.M.E"
BACKUP_FORMAT = "fame.encrypted.backup"
KDF_ITERATIONS = 250000

SEED_TYPES = [
    ("asset", "Assets", "debit", 100000),
    ("liability", "Liabilities", "credit", 200000),
    ("equity", "Equity", "credit", 300000),
    ("income", "Income", "credit", 400000),
    ("expense", "Expenses", "debit", 500000),
]

SEED_HEADS = [
    ("101000", "Cash and Bank", "asset"),
    ("102000", "Receivables", "asset"),
    ("103000", "Inventory", "asset"),
    ("104000", "Fixed Assets", "asset"),
    ("201000", "Payables", "liability"),
    ("202000", "Duties and Taxes", "liability"),
    ("301000", "Capital", "equity"),
    ("302000", "Accumulated Profit and Loss", "equity"),
    ("401000", "Sales", "income"),
    ("402000", "Service Income", "income"),
    ("403000", "Other Income", "income"),
    ("501000", "Purchases", "expense"),
    ("502000", "Operating Expenses", "expense"),
    ("503000", "Asset Disposal Losses", "expense"),
]

SEED_SUBHEADS = [
    ("101100", "Cash", "101000"),
    ("101200", "Bank", "101000"),
    ("102100", "Accounts Receivable", "102000"),
    ("103100", "Stock", "103000"),
    ("104100", "Tangible Fixed Assets", "104000"),
    ("104900", "Accumulated Depreciation", "104000"),
    ("201100", "Accounts Payable", "201000"),
    ("202100", "GST Control Accounts", "202000"),
    ("301100", "Owner Capital", "301000"),
    ("302100", "Accumulated Profit and Loss", "302000"),
    ("401100", "Product Sales", "401000"),
    ("402100", "Service Income", "402000"),
    ("403100", "Profit on Sale of Assets", "403000"),
    ("501100", "Purchase Accounts", "501000"),
    ("502100", "Rent", "502000"),
    ("502200", "Salary", "502000"),
    ("502300", "Depreciation", "502000"),
    ("503100", "Loss on Sale of Assets", "503000"),
]

SEED_ACCOUNTS = [
    ("101101", "Cash in Hand", "101100"),
    ("101201", "Bank Account", "101200"),
    ("102101", "General Customer", "102100"),
    ("103101", "Inventory Stock", "103100"),
    ("104101", "Plant and Machinery", "104100"),
    ("104901", "Accumulated Depreciation", "104900"),
    ("201101", "General Supplier", "201100"),
    ("202101", "CGST", "202100"),
    ("202102", "SGST", "202100"),
    ("202103", "IGST", "202100"),
    ("301101", "Owner Capital", "301100"),
    ("302101", "Accumulated Profit and Loss", "302100"),
    ("401101", "Sales", "401100"),
    ("402101", "Service Income", "402100"),
    ("403101", "Profit on Sale of Assets", "403100"),
    ("501101", "Purchases", "501100"),
    ("502101", "Rent Expense", "502100"),
    ("502201", "Salary Expense", "502200"),
    ("502301", "Depreciation Expense", "502300"),
    ("503101", "Loss on Sale of Assets", "503100"),
]

INDIA_STATES = ["TN", "KA", "KL", "AP", "TS", "MH", "GJ", "DL", "RJ", "WB", "UP"]
ELECTRONICS = [
    ("LED Television 43 inch", "8528", 18),
    ("Laptop Computer", "8471", 18),
    ("Desktop Computer", "8471", 18),
    ("Smart Phone", "8517", 18),
    ("Bluetooth Speaker", "8518", 18),
    ("WiFi Router", "8517", 18),
    ("Computer Monitor", "8528", 18),
    ("Inkjet Printer", "8443", 18),
    ("CCTV Camera", "8525", 18),
    ("USB Storage Drive", "8523", 18),
    ("Keyboard and Mouse Combo", "8471", 18),
    ("Air Conditioner", "8415", 28),
    ("Refrigerator", "8418", 18),
    ("Washing Machine", "8450", 18),
    ("Microwave Oven", "8516", 18),
]
SERVICE_PRODUCTS = [
    ("Installation Service", "9987", 18, "502101", "402101"),
    ("Annual Maintenance Service", "9987", 18, "502101", "402101"),
    ("Delivery Charges", "9968", 18, "502101", "402101"),
]


@dataclass
class Config:
    output: Path
    years: int = 3
    financial_year_start: str = "01-04"
    accounts: int = 60
    products: int = 25
    assets: int = 8
    transactions: int = 500
    seed: int = 42
    password: str = ""
    gst_enabled: bool = True


class Generator:
    def __init__(self, config: Config):
        self.config = config
        self.random = random.Random(config.seed)
        self.faker = Faker("en_IN") if Faker else None
        if self.faker:
            self.faker.seed_instance(config.seed)
        self.now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        self.data = {table: [] for table in [
            "settings", "account_types", "head_accounts", "subhead_accounts",
            "accounts", "company_master", "products", "fixed_assets", "tags",
            "coa_tags", "vouchers", "voucher_lines", "voucher_items", "voucher_tags",
            "fixed_asset_depreciation_entries"
        ]}
        self.ids_by_code: dict[str, str] = {}
        self.voucher_seq: dict[tuple[str, str], int] = {}
        self.customers: list[dict] = []
        self.suppliers: list[dict] = []
        self.products: list[dict] = []
        self.fixed_assets: list[dict] = []
        try:
            fy_day, fy_month = (int(part) for part in config.financial_year_start.split("-", 1))
            date(2001, fy_month, fy_day)
        except (TypeError, ValueError) as exc:
            raise ValueError("Financial year start must be a valid dd-mm value, for example 01-04.") from exc
        self.fy_day = fy_day
        self.fy_month = fy_month
        today = date.today()
        current_fy_start = date(today.year, self.fy_month, self.fy_day)
        if today < current_fy_start:
            current_fy_start = date(today.year - 1, self.fy_month, self.fy_day)
        self.start_date = date(current_fy_start.year - config.years + 1, self.fy_month, self.fy_day)
        self.end_date = today

    def uid(self) -> str:
        return str(uuid.uuid4())

    def rand_date(self) -> date:
        days = (self.end_date - self.start_date).days
        return self.start_date + timedelta(days=self.random.randint(0, max(days, 1)))

    def fy_code(self, value: date) -> str:
        start_year = value.year if value >= date(value.year, self.fy_month, self.fy_day) else value.year - 1
        return f"{str(start_year)[-2:]}{str(start_year + 1)[-2:]}"

    def voucher_no(self, voucher_type: str, value: date) -> str:
        prefix = {
            "receipt": "R",
            "payment": "V",
            "purchase": "P",
            "sales": "S",
            "journal": "J",
            "expense": "E",
            "income": "I",
        }[voucher_type]
        key = (prefix, self.fy_code(value))
        self.voucher_seq[key] = self.voucher_seq.get(key, 0) + 1
        return f"{prefix}-{key[1]}-{self.voucher_seq[key]:04d}"

    def renumber_vouchers(self) -> None:
        self.voucher_seq.clear()
        indexed_vouchers = list(enumerate(self.data["vouchers"]))
        indexed_vouchers.sort(key=lambda item: (item[1]["voucher_date"], item[0]))
        for _, voucher in indexed_vouchers:
            voucher["voucher_no"] = self.voucher_no(
                voucher["type"],
                date.fromisoformat(voucher["voucher_date"]),
            )

    def money(self, rupees: float) -> int:
        return int(round(rupees * 100))

    def account(self, code: str) -> str:
        return self.ids_by_code[code]

    def name(self, suffix: str) -> str:
        if self.faker:
            return f"{self.faker.name()} {suffix}"
        first = self.random.choice(["Ravi", "Kumar", "Suresh", "Anitha", "Meena", "Arun", "Priya", "Karthik"])
        last = self.random.choice(["Stores", "Traders", "Electronics", "Agencies", "Enterprises", "Mart"])
        return f"{first} {last} {suffix}"

    def build(self) -> dict:
        self.seed_chart()
        self.add_company()
        self.add_parties()
        self.add_products()
        self.add_opening_capital()
        self.add_fixed_asset_purchases()
        self.add_transactions()
        self.add_asset_sales()
        self.renumber_vouchers()
        return {
            "app": APP_NAME,
            "schemaVersion": SCHEMA_VERSION,
            "exportedAt": self.now,
            "data": self.data,
        }

    def seed_chart(self) -> None:
        self.data["settings"].append({"key": "schema_version", "value": str(SCHEMA_VERSION)})
        for row in SEED_TYPES:
            self.data["account_types"].append({
                "id": row[0], "name": row[1], "normal_side": row[2], "base_code": row[3]
            })
        for code, name, type_id in SEED_HEADS:
            row_id = self.uid()
            self.ids_by_code[code] = row_id
            self.data["head_accounts"].append({
                "id": row_id, "code": code, "name": name, "type_id": type_id,
                "created_at": self.now, "updated_at": self.now
            })
        for code, name, head_code in SEED_SUBHEADS:
            row_id = self.uid()
            self.ids_by_code[code] = row_id
            self.data["subhead_accounts"].append({
                "id": row_id, "code": code, "name": name, "head_id": self.account(head_code),
                "created_at": self.now, "updated_at": self.now
            })
        for code, name, subhead_code in SEED_ACCOUNTS:
            self.add_account(code, name, subhead_code)

    def add_account(self, code: str, name: str, subhead_code: str, *, personal=False, state="") -> dict:
        row_id = self.uid()
        self.ids_by_code[code] = row_id
        row = {
            "id": row_id, "code": code, "name": name, "subhead_id": self.account(subhead_code),
            "is_personal": 1 if personal else 0,
            "gst_no": self.fake_gstin(state) if personal and self.config.gst_enabled else "",
            "pan_no": self.fake_pan() if personal else "",
            "registration_1": "", "registration_2": "", "registration_3": "",
            "state": state, "created_at": self.now, "updated_at": self.now
        }
        self.data["accounts"].append(row)
        return row

    def fake_pan(self) -> str:
        return "".join(self.random.choice(string.ascii_uppercase) for _ in range(5)) + f"{self.random.randint(1000,9999)}" + self.random.choice(string.ascii_uppercase)

    def fake_gstin(self, state_code: str) -> str:
        state_no = {
            "TN": "33", "KA": "29", "KL": "32", "AP": "37", "TS": "36", "MH": "27",
            "GJ": "24", "DL": "07", "RJ": "08", "WB": "19", "UP": "09"
        }.get(state_code, "33")
        return f"{state_no}{self.fake_pan()}1Z{self.random.randint(1,9)}"

    def add_company(self) -> None:
        self.data["company_master"].append({
            "id": 1,
            "name": "FAME Electronics Trading Private Limited",
            "address": "No. 42, Anna Salai, Chennai - 600002",
            "state": "TN",
            "country": "India",
            "gst_no": "33ABCDE1234F1Z5",
            "pan_no": "ABCDE1234F",
            "registration_1": "CIN-U52300TN2021PTC123456",
            "registration_2": "MSME-UDYAM-TN-02-0001234",
            "registration_3": "",
            "financial_year_start": self.start_date.isoformat(),
            "gst_enabled": 1 if self.config.gst_enabled else 0,
            "updated_at": self.now,
        })

    def add_parties(self) -> None:
        party_count = max(self.config.accounts - len(SEED_ACCOUNTS), 10)
        customer_count = max(5, party_count * 3 // 5)
        supplier_count = max(5, party_count - customer_count)
        for index in range(customer_count):
            state = self.random.choice(INDIA_STATES)
            account = self.add_account(f"102{102 + index:03d}", self.name("Customer"), "102100", personal=True, state=state)
            self.customers.append(account)
        for index in range(supplier_count):
            state = self.random.choice(INDIA_STATES)
            account = self.add_account(f"201{102 + index:03d}", self.name("Supplier"), "201100", personal=True, state=state)
            self.suppliers.append(account)

    def add_products(self) -> None:
        selected = (ELECTRONICS * ((self.config.products // len(ELECTRONICS)) + 1))[: self.config.products]
        for index, (name, hsn, rate) in enumerate(selected):
            row = {
                "id": self.uid(),
                "name": f"{name} Model {index + 1}",
                "kind": "product",
                "hsn_sac_code": hsn,
                "gst_rate": rate,
                "itc_available": 1,
                "purchase_account_id": self.account("501101"),
                "sales_account_id": self.account("401101"),
                "created_at": self.now,
                "updated_at": self.now,
            }
            self.data["products"].append(row)
            self.products.append(row)
        for name, sac, rate, purchase_code, sales_code in SERVICE_PRODUCTS:
            row = {
                "id": self.uid(), "name": name, "kind": "service", "hsn_sac_code": sac,
                "gst_rate": rate, "itc_available": 1,
                "purchase_account_id": self.account(purchase_code),
                "sales_account_id": self.account(sales_code),
                "created_at": self.now, "updated_at": self.now,
            }
            self.data["products"].append(row)
            self.products.append(row)

    def add_opening_capital(self) -> None:
        value = self.start_date
        amount = self.money(2500000)
        self.add_voucher("journal", value, [
            (self.account("101201"), "Opening bank balance", amount, 0),
            (self.account("301101"), "Opening capital", 0, amount),
        ], narration="Opening capital introduced")

    def tax_split(self, taxable: int, rate: float, party_state: str) -> tuple[int, int, int, int]:
        tax = int(round(taxable * rate / 100))
        if not self.config.gst_enabled:
            return 0, 0, 0, taxable
        if party_state == "TN":
            cgst = tax // 2
            sgst = tax - cgst
            return cgst, sgst, 0, taxable + tax
        return 0, 0, tax, taxable + tax

    def financial_year_start_for(self, value: date) -> date:
        current = date(value.year, self.fy_month, self.fy_day)
        return current if value >= current else date(value.year - 1, self.fy_month, self.fy_day)

    def next_financial_year_start(self, value: date) -> date:
        start = self.financial_year_start_for(value)
        return date(start.year + 1, self.fy_month, self.fy_day)

    @staticmethod
    def days_inclusive(start: date, end: date) -> int:
        return max(0, (end - start).days + 1)

    @staticmethod
    def working_amount(minor: int) -> str:
        return f"{minor / 100:.2f}"

    def depreciation_for_range(self, asset: dict, start: date, end: date, opening_wdv: int) -> dict:
        purchase_date = date.fromisoformat(asset["purchase_date"])
        sale_date = date.fromisoformat(asset["sale_date"]) if asset.get("sale_date") else None
        active_from = max(start, purchase_date)
        active_to = min(end, sale_date) if sale_date else end
        active_days = self.days_inclusive(active_from, active_to)
        year_days = self.days_inclusive(self.financial_year_start_for(start), self.next_financial_year_start(start) - timedelta(days=1))
        base = opening_wdv if asset["depreciation_method"] == "WDV" else int(asset["purchase_amount_minor"])
        annual = round(base * float(asset["depreciation_rate"]) / 100)
        prorated = round(annual * active_days / year_days) if year_days else 0
        maximum = max(0, opening_wdv - int(asset["scrap_value_minor"]))
        depreciation = 0 if not active_days or opening_wdv <= int(asset["scrap_value_minor"]) else min(prorated, maximum)
        return {
            "active_from": active_from,
            "active_to": active_to,
            "active_days": active_days,
            "year_days": year_days,
            "base": base,
            "prorated": prorated,
            "depreciation": depreciation,
        }

    def depreciation_position(self, asset: dict, as_of_date: date) -> dict:
        cursor = self.financial_year_start_for(date.fromisoformat(asset["purchase_date"]))
        wdv = int(asset["purchase_amount_minor"])
        depreciation = 0
        periods = []
        while cursor <= as_of_date:
            year_end = self.next_financial_year_start(cursor) - timedelta(days=1)
            period_end = min(year_end, as_of_date)
            period = self.depreciation_for_range(asset, cursor, period_end, wdv)
            periods.append(period)
            depreciation += period["depreciation"]
            wdv -= period["depreciation"]
            sale_date = date.fromisoformat(asset["sale_date"]) if asset.get("sale_date") else None
            if period_end >= as_of_date or (sale_date and period_end >= sale_date):
                break
            cursor = self.next_financial_year_start(cursor)
        return {"depreciation": depreciation, "wdv": wdv, "periods": periods}

    def depreciation_working_note(self, asset: dict, as_of_date: date) -> str:
        position = self.depreciation_position(asset, as_of_date)
        period_notes = []
        for period in position["periods"]:
            if not period["active_days"]:
                continue
            note = (
                f"{period['active_from'].strftime('%d-%m-%Y')} to {period['active_to'].strftime('%d-%m-%Y')}: "
                f"{self.working_amount(period['base'])} x {asset['depreciation_rate']}% "
                f"x {period['active_days']}/{period['year_days']} = {self.working_amount(period['depreciation'])}"
            )
            if period["depreciation"] < period["prorated"]:
                note += " (limited to scrap value)"
            period_notes.append(note)
        return (
            f"{asset['depreciation_method']} depreciation; {'; '.join(period_notes) or 'no depreciation days'}; "
            f"accumulated depreciation {self.working_amount(position['depreciation'])}; "
            f"WDV {self.working_amount(position['wdv'])}; scrap value {self.working_amount(asset['scrap_value_minor'])}"
        )

    def add_voucher(self, voucher_type: str, value: date, lines: list[tuple[str, str, int, int]], *,
                    party_id=None, invoice_no=None, narration=None) -> dict:
        lines = [(account_id, description, debit, credit) for account_id, description, debit, credit in lines if debit or credit]
        if len(lines) < 2:
            raise ValueError(f"{voucher_type} voucher on {value} has fewer than two non-zero lines.")
        voucher_id = self.uid()
        self.data["vouchers"].append({
            "id": voucher_id,
            "voucher_no": self.voucher_no(voucher_type, value),
            "type": voucher_type,
            "voucher_date": value.isoformat(),
            "reference_no": None,
            "invoice_no": invoice_no,
            "invoice_date": value.isoformat() if invoice_no else None,
            "narration": narration,
            "party_account_id": party_id,
            "created_at": self.now,
            "updated_at": self.now,
        })
        for order, (account_id, description, debit, credit) in enumerate(lines):
            self.data["voucher_lines"].append({
                "id": self.uid(), "voucher_id": voucher_id, "account_id": account_id,
                "description": description, "debit_minor": debit, "credit_minor": credit,
                "sort_order": order
            })
        return self.data["vouchers"][-1]

    def add_item(self, voucher_id: str, product: dict, taxable: int, party_state: str, quantity: float = 1) -> tuple[int, int, int, int]:
        cgst, sgst, igst, total = self.tax_split(taxable, float(product["gst_rate"]), party_state)
        self.data["voucher_items"].append({
            "id": self.uid(), "voucher_id": voucher_id, "product_id": product["id"],
            "quantity": quantity, "gst_rate": product["gst_rate"], "taxable_minor": taxable,
            "cgst_minor": cgst, "sgst_minor": sgst, "igst_minor": igst,
            "total_minor": total, "sort_order": 0
        })
        return cgst, sgst, igst, total

    def add_invoice(self, voucher_type: str, value: date, product: dict, party: dict, taxable: int) -> dict:
        cgst, sgst, igst, total = self.tax_split(taxable, float(product["gst_rate"]), party["state"])
        invoice_no = f"{voucher_type.upper()}-{value.strftime('%Y%m%d')}-{self.random.randint(100,999)}"
        if voucher_type in {"purchase", "expense"}:
            lines = [(product["purchase_account_id"], product["name"], taxable, 0)]
            if self.config.gst_enabled:
                lines += [(self.account("202101"), "Input CGST", cgst, 0), (self.account("202102"), "Input SGST", sgst, 0), (self.account("202103"), "Input IGST", igst, 0)]
            lines.append((party["id"], "Supplier", 0, total))
        else:
            lines = [(product["sales_account_id"], product["name"], 0, taxable)]
            if self.config.gst_enabled:
                lines += [(self.account("202101"), "Output CGST", 0, cgst), (self.account("202102"), "Output SGST", 0, sgst), (self.account("202103"), "Output IGST", 0, igst)]
            lines.append((party["id"], "Customer", total, 0))
        voucher = self.add_voucher(voucher_type, value, lines, party_id=party["id"], invoice_no=invoice_no)
        self.add_item(voucher["id"], product, taxable, party["state"])
        return voucher

    def add_fixed_asset_purchases(self) -> None:
        machine_product = self.products[0]
        for index in range(self.config.assets):
            value = self.start_date + timedelta(days=self.random.randint(0, max((self.end_date - self.start_date).days - 120, 1)))
            supplier = self.random.choice(self.suppliers)
            cost = self.money(self.random.randint(60000, 450000))
            cgst, sgst, igst, total = self.tax_split(cost, float(machine_product["gst_rate"]), supplier["state"])
            name = f"{self.random.choice(['Laptop', 'Display Unit', 'Billing Computer', 'Delivery Scooter', 'Demo Television'])} {index + 1}"
            lines = [(self.account("104101"), name, cost, 0)]
            if self.config.gst_enabled:
                lines += [(self.account("202101"), "Input CGST", cgst, 0), (self.account("202102"), "Input SGST", sgst, 0), (self.account("202103"), "Input IGST", igst, 0)]
            lines.append((supplier["id"], "Supplier", 0, total))
            voucher = self.add_voucher("purchase", value, lines, party_id=supplier["id"], invoice_no=f"FA-{index + 1:03d}")
            self.add_item(voucher["id"], machine_product, cost, supplier["state"])
            asset = {
                "id": self.uid(), "name": name, "asset_account_id": self.account("104101"),
                "purchase_voucher_id": voucher["id"], "purchase_date": value.isoformat(),
                "purchase_amount_minor": cost, "depreciation_method": self.random.choice(["SLM", "WDV"]),
                "depreciation_rate": self.random.choice([10, 15, 20]), "scrap_value_minor": self.money(cost / 100 * 5 / 100),
                "sale_voucher_id": None, "sale_date": None, "sale_amount_minor": 0,
                "created_at": self.now, "updated_at": self.now
            }
            self.data["fixed_assets"].append(asset)
            self.fixed_assets.append(asset)

    def add_asset_sales(self) -> None:
        if not self.fixed_assets:
            return
        for asset in self.random.sample(self.fixed_assets, k=max(1, len(self.fixed_assets) // 4)):
            purchase_date = date.fromisoformat(asset["purchase_date"])
            sale_date = min(self.end_date, purchase_date + timedelta(days=self.random.randint(250, 900)))
            if sale_date <= purchase_date:
                continue
            customer = self.random.choice(self.customers)
            sale_value = int(asset["purchase_amount_minor"] * self.random.uniform(0.45, 0.9))
            product = self.products[0]
            cgst, sgst, igst, total = self.tax_split(sale_value, float(product["gst_rate"]), customer["state"])
            asset_for_sale = {**asset, "sale_date": sale_date.isoformat()}
            depreciation_position = self.depreciation_position(asset_for_sale, sale_date)
            depn = depreciation_position["depreciation"]
            book_value = max(0, asset["purchase_amount_minor"] - depn)
            profit = max(0, sale_value - book_value)
            loss = max(0, book_value - sale_value)
            depreciation_note = self.depreciation_working_note(asset_for_sale, sale_date)
            result_note = (
                f"profit {self.working_amount(profit)} = sale value {self.working_amount(sale_value)} "
                f"- book value {self.working_amount(book_value)}"
                if profit else
                f"loss {self.working_amount(loss)} = book value {self.working_amount(book_value)} "
                f"- sale value {self.working_amount(sale_value)}"
            )
            narration = (
                f"Fixed asset disposal working for {asset['name']}: cost {self.working_amount(asset['purchase_amount_minor'])}; "
                f"{depreciation_note}; book value {self.working_amount(book_value)} = cost "
                f"{self.working_amount(asset['purchase_amount_minor'])} - accumulated depreciation "
                f"{self.working_amount(depn)}; {result_note}."
            )
            lines = [
                (customer["id"], "Customer", total, 0),
                (asset["asset_account_id"], asset["name"], 0, asset["purchase_amount_minor"]),
                (self.account("502301"), f"Depreciation up to sale {self.working_amount(depn)}; {depreciation_note}", depn, 0),
            ]
            if self.config.gst_enabled:
                lines += [(self.account("202101"), "Output CGST", 0, cgst), (self.account("202102"), "Output SGST", 0, sgst), (self.account("202103"), "Output IGST", 0, igst)]
            if profit:
                lines.append((self.account("403101"), f"Profit {self.working_amount(profit)} = sale {self.working_amount(sale_value)} - WDV {self.working_amount(book_value)}", 0, profit))
            if loss:
                lines.append((self.account("503101"), f"Loss {self.working_amount(loss)} = WDV {self.working_amount(book_value)} - sale {self.working_amount(sale_value)}", loss, 0))
            voucher = self.add_voucher(
                "sales",
                sale_date,
                lines,
                party_id=customer["id"],
                invoice_no=f"FAS-{sale_date.strftime('%Y%m%d')}",
                narration=narration,
            )
            for period in depreciation_position["periods"]:
                if not period["depreciation"]:
                    continue
                self.data["fixed_asset_depreciation_entries"].append({
                    "id": self.uid(),
                    "asset_id": asset["id"],
                    "voucher_id": voucher["id"],
                    "posting_type": "sale",
                    "financial_year_start": self.financial_year_start_for(period["active_to"]).isoformat(),
                    "through_date": period["active_to"].isoformat(),
                    "depreciation_days": period["active_days"],
                    "amount_minor": period["depreciation"],
                    "created_at": self.now,
                })
            self.add_item(voucher["id"], product, sale_value, customer["state"])
            asset["sale_voucher_id"] = voucher["id"]
            asset["sale_date"] = sale_date.isoformat()
            asset["sale_amount_minor"] = sale_value

    def add_transactions(self) -> None:
        for _ in range(self.config.transactions):
            value = self.rand_date()
            pick = self.random.random()
            product = self.random.choice(self.products)
            if pick < 0.38:
                customer = self.random.choice(self.customers)
                taxable = self.money(self.random.randint(3000, 180000))
                self.add_invoice("sales", value, product, customer, taxable)
            elif pick < 0.68:
                supplier = self.random.choice(self.suppliers)
                taxable = self.money(self.random.randint(5000, 220000))
                self.add_invoice("purchase", value, product, supplier, taxable)
            elif pick < 0.80:
                customer = self.random.choice(self.customers)
                amount = self.money(self.random.randint(2000, 150000))
                self.add_voucher("receipt", value, [(self.account("101201"), "Receipt", amount, 0), (customer["id"], "Customer receipt", 0, amount)])
            elif pick < 0.91:
                supplier = self.random.choice(self.suppliers)
                amount = self.money(self.random.randint(2000, 150000))
                self.add_voucher("payment", value, [(supplier["id"], "Supplier payment", amount, 0), (self.account("101201"), "Payment", 0, amount)])
            elif pick < 0.97:
                supplier = self.random.choice(self.suppliers)
                service = self.random.choice(SERVICE_PRODUCTS)
                product_row = next(item for item in self.products if item["name"] == service[0])
                self.add_invoice("expense", value, product_row, supplier, self.money(self.random.randint(1000, 30000)))
            else:
                amount = self.money(self.random.randint(1000, 25000))
                self.add_voucher("journal", value, [(self.account("502101"), "Adjustment", amount, 0), (self.account("101201"), "Adjustment", 0, amount)])


def encrypt_backup(backup: dict, password: str) -> dict:
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.hashes import SHA256
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    except Exception as exc:
        raise RuntimeError("Install cryptography to create encrypted backups: pip install cryptography") from exc
    salt = os.urandom(16)
    iv = os.urandom(12)
    key = PBKDF2HMAC(algorithm=SHA256(), length=32, salt=salt, iterations=KDF_ITERATIONS).derive(password.encode())
    ciphertext = AESGCM(key).encrypt(iv, json.dumps(backup, separators=(",", ":")).encode(), None)
    return {
        "format": BACKUP_FORMAT,
        "version": 1,
        "kdf": "PBKDF2-SHA256",
        "iterations": KDF_ITERATIONS,
        "cipher": "AES-256-GCM",
        "salt": base64.b64encode(salt).decode(),
        "iv": base64.b64encode(iv).decode(),
        "data": base64.b64encode(ciphertext).decode(),
    }


def generate(config: Config) -> None:
    backup = Generator(config).build()
    payload = encrypt_backup(backup, config.password) if config.password else backup
    config.output.parent.mkdir(parents=True, exist_ok=True)
    config.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")


class App(Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("F.A.M.E Sample Data Generator")
        self.resizable(False, False)
        default_output = Path.cwd() / "fame-electronics-sample.json"
        self.output = StringVar(value=str(default_output))
        self.years = IntVar(value=3)
        self.financial_year_start = StringVar(value="01-04")
        self.accounts = IntVar(value=80)
        self.products = IntVar(value=30)
        self.assets = IntVar(value=10)
        self.transactions = IntVar(value=1000)
        self.seed = IntVar(value=42)
        self.password = StringVar(value="")
        self.gst_enabled = BooleanVar(value=True)
        self.build_ui()

    def build_ui(self) -> None:
        frame = ttk.Frame(self, padding=14)
        frame.grid(row=0, column=0)
        fields = [
            ("Years", self.years),
            ("FY Start (dd-mm)", self.financial_year_start),
            ("Accounts", self.accounts),
            ("Products", self.products),
            ("Fixed Assets", self.assets),
            ("Transactions", self.transactions),
            ("Random Seed", self.seed),
        ]
        for row, (label, var) in enumerate(fields):
            ttk.Label(frame, text=label).grid(row=row, column=0, sticky="w", pady=4)
            ttk.Entry(frame, textvariable=var, width=18).grid(row=row, column=1, sticky="ew", pady=4)
        ttk.Label(frame, text="Output JSON").grid(row=7, column=0, sticky="w", pady=4)
        ttk.Entry(frame, textvariable=self.output, width=48).grid(row=7, column=1, sticky="ew", pady=4)
        ttk.Button(frame, text="Browse", command=self.browse).grid(row=7, column=2, padx=6)
        ttk.Label(frame, text="Encrypt Password").grid(row=8, column=0, sticky="w", pady=4)
        ttk.Entry(frame, textvariable=self.password, width=18, show="*").grid(row=8, column=1, sticky="ew", pady=4)
        ttk.Checkbutton(frame, text="GST enabled", variable=self.gst_enabled).grid(row=9, column=1, sticky="w", pady=4)
        ttk.Button(frame, text="Generate", command=self.run_generate).grid(row=10, column=1, sticky="e", pady=(12, 0))

    def browse(self) -> None:
        filename = filedialog.asksaveasfilename(
            title="Save F.A.M.E sample backup",
            defaultextension=".json",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")]
        )
        if filename:
            self.output.set(filename)

    def run_generate(self) -> None:
        try:
            generate(Config(
                output=Path(self.output.get()),
                years=int(self.years.get()),
                financial_year_start=self.financial_year_start.get(),
                accounts=int(self.accounts.get()),
                products=int(self.products.get()),
                assets=int(self.assets.get()),
                transactions=int(self.transactions.get()),
                seed=int(self.seed.get()),
                password=self.password.get(),
                gst_enabled=bool(self.gst_enabled.get()),
            ))
            messagebox.showinfo("Generated", f"Sample data written to:\n{self.output.get()}")
        except Exception as exc:
            messagebox.showerror("Generation failed", str(exc))


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate F.A.M.E sample electronics trading data.")
    parser.add_argument("--no-gui", action="store_true", help="Run in CLI mode.")
    parser.add_argument("--output", default="fame-electronics-sample.json")
    parser.add_argument("--years", type=int, default=3)
    parser.add_argument("--financial-year-start", default="01-04", help="Financial year start in dd-mm format.")
    parser.add_argument("--accounts", type=int, default=80)
    parser.add_argument("--products", type=int, default=30)
    parser.add_argument("--assets", type=int, default=10)
    parser.add_argument("--transactions", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--password", default="", help="Optional password for F.A.M.E encrypted backup format.")
    parser.add_argument("--no-gst", action="store_true", help="Disable GST in generated company/sample invoices.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if not args.no_gui:
        App().mainloop()
        return 0
    generate(Config(
        output=Path(args.output),
        years=args.years,
        financial_year_start=args.financial_year_start,
        accounts=args.accounts,
        products=args.products,
        assets=args.assets,
        transactions=args.transactions,
        seed=args.seed,
        password=args.password,
        gst_enabled=not args.no_gst,
    ))
    print(f"Generated {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
