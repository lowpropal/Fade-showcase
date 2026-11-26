import getpass
import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook


PROJECT_URL = "https://nduzczauaibgwjuwhuod.supabase.co"
PUBLISHABLE_KEY = "sb_publishable_SsBG3rG52DWnHWyOgkiM0w_UwTITF3-"
DEFAULT_WORKBOOK = Path(
    "/Users/naufalausan/Documents/Fade project/03_Updated by Opal/Brief Baru Caca/FADE_Master_3_Sheet + Rebate.xlsx"
)
SALES_IDS = {
    "aru": "SLS-ARU",
    "nurdin": "SLS-NUR",
    "niko": "SLS-NIK",
    "roland": "SLS-ROL",
    "akim": "SLS-AKI",
    "aldy": "SLS-ALD",
    "mey": "SLS-MEY",
    "sales bandung (tba)": "SLS-TBA",
}


def text(value):
    if value is None:
        return ""
    return str(value).strip()


def json_value(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def row_dict(headers, values):
    return {str(key): json_value(value) for key, value in zip(headers, values) if key is not None}


def numeric(value):
    if value is None or value == "":
        return 0
    if isinstance(value, (int, float)):
        return value
    cleaned = str(value).replace("Rp", "").replace("IDR", "").replace(".", "").replace(",", ".").strip()
    return float(cleaned or 0)


def as_date(value, fallback=None):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    raw = text(value)
    if len(raw) == 7 and raw[4] == "-":
        return raw + "-01"
    if len(raw) >= 10 and raw[4] == "-":
        return raw[:10]
    return fallback


def store_id(client_id, store_name):
    if text(client_id):
        return text(client_id)
    digest = hashlib.sha256(text(store_name).casefold().encode("utf-8")).hexdigest()[:16]
    return "ST-" + digest.upper()


def read_sheet(workbook, sheet_name):
    sheet = workbook[sheet_name]
    rows = sheet.iter_rows(values_only=True)
    headers = next(rows)
    return [row_dict(headers, row) for row in rows if any(value is not None for value in row)]


def build_payload(workbook_path):
    workbook = load_workbook(workbook_path, read_only=True, data_only=True)
    invoices_source = read_sheet(workbook, "Invoice_Collection")
    monthly_source = read_sheet(workbook, "Sales_Monthly")
    rewards_source = read_sheet(workbook, "Client_Reward_Tracking")

    monthly_latest = {}
    monthly_targets = {}
    for row in monthly_source:
        name = text(row.get("Sales"))
        sales_id = SALES_IDS.get(name.casefold())
        month = text(row.get("Periode"))[:7]
        if not sales_id or len(month) != 7:
            continue
        monthly_targets[(sales_id, month)] = row
        if sales_id not in monthly_latest or month > monthly_latest[sales_id][0]:
            monthly_latest[sales_id] = (month, row)

    sales_names = {
        "Aru": "SLS-ARU",
        "Nurdin": "SLS-NUR",
        "Niko": "SLS-NIK",
        "Roland": "SLS-ROL",
        "Akim": "SLS-AKI",
        "Aldy": "SLS-ALD",
        "Mey": "SLS-MEY",
        "Sales Bandung (TBA)": "SLS-TBA",
    }
    sales = []
    for name, sales_id in sales_names.items():
        latest = monthly_latest.get(sales_id)
        source = latest[1] if latest else {}
        sales.append({
            "id": sales_id,
            "name": name,
            "username": name.casefold().replace(" ", "_"),
            "is_active": name not in ("Mey", "Sales Bandung (TBA)"),
            "target_monthly": int(numeric(source.get("Target_PCS"))),
            "data": source,
        })

    stores_by_id = {}
    store_ids_by_name = defaultdict(set)
    normalized_invoices = []
    for row in invoices_source:
        name = text(row.get("Nama_Toko"))
        sid = store_id(row.get("Client_ID"), name)
        store_ids_by_name[name.casefold()].add(sid)
        date_value = as_date(row.get("Tanggal_Invoice"))
        month = text(row.get("Periode"))[:7] or (date_value[:7] if date_value else "")
        sales_name = text(row.get("Sales_KPI"))
        sales_id = SALES_IDS.get(sales_name.casefold())
        if not sales_id or not date_value or not name:
            raise ValueError("Ada baris invoice dengan sales, tanggal, atau nama toko yang tidak valid.")

        current = stores_by_id.get(sid)
        candidate = {
            "id": sid,
            "name": name,
            "partner_type": text(row.get("Jenis_Partner")) or None,
            "account_status": text(row.get("Status_Akun")) or None,
            "data": row,
        }
        if not current or date_value >= current[0]:
            stores_by_id[sid] = (date_value, candidate)

        qty = numeric(row.get("Qty_PCS"))
        total = numeric(row.get("Revenue_IDR"))
        invoice = {
            "id": text(row.get("Invoice_ID")),
            "sales_id": sales_id,
            "store_id": sid,
            "store_name": name,
            "invoice_date": date_value,
            "invoice_total": total,
            "paid_total": numeric(row.get("Terbayar_IDR")),
            "outstanding": numeric(row.get("Outstanding_IDR")),
            "data": {
                "id": text(row.get("Invoice_ID")),
                "invoiceId": text(row.get("Invoice_ID")),
                "date": date_value,
                "periode": month,
                "storeId": sid,
                "storeName": name,
                "salesId": sales_id,
                "salesName": sales_name,
                "salesHistoris": text(row.get("Sales_Historis")),
                "salesSaatIni": text(row.get("Sales_Saat_Ini")),
                "salesKpi": sales_name,
                "qty": qty,
                "qtyGratis": numeric(row.get("Qty_Gratis_PCS")),
                "invoiceTotal": total,
                "paidTotal": numeric(row.get("Terbayar_IDR")),
                "otherSettlement": numeric(row.get("Penyelesaian_Lain_IDR")),
                "outstanding": numeric(row.get("Outstanding_IDR")),
                "dueDate": as_date(row.get("Jatuh_Tempo")),
                "lastPaymentDate": as_date(row.get("Tgl_Bayar_Terakhir")),
                "statusBayarRaw": text(row.get("Status_Bayar")),
                "jenisPartner": text(row.get("Jenis_Partner")),
                "statusAkun": text(row.get("Status_Akun")),
                "rincianProduk": text(row.get("Rincian_Produk")),
                "unitPrice": (total / qty) if qty else 0,
                "sourceRow": row,
            },
        }
        if not invoice["id"]:
            raise ValueError("Ada baris invoice tanpa Invoice_ID.")
        normalized_invoices.append(invoice)

    stores = [entry[1] for entry in stores_by_id.values()]
    stores.sort(key=lambda row: row["id"])
    targets = []
    for (sales_id, month), row in monthly_targets.items():
        targets.append({
            "sales_id": sales_id,
            "period": month + "-01",
            "target_qty": int(numeric(row.get("Target_PCS"))),
            "data": row,
        })

    rewards = []
    reward_ids = set()
    for row in rewards_source:
        rid = text(row.get("Reward_ID"))
        name = text(row.get("Nama_Toko"))
        ids = store_ids_by_name.get(name.casefold(), set())
        sid = text(row.get("Client_ID")) or (next(iter(ids)) if len(ids) == 1 else store_id(None, name))
        period = as_date(row.get("Bulan_Program")) or as_date(row.get("Bulan_Invoice_Sumber"))
        if not rid or not name or not period:
            raise ValueError("Ada baris reward tanpa ID, nama toko, atau periode.")
        if sid not in stores_by_id:
            stores_by_id[sid] = (period, {
                "id": sid,
                "name": name,
                "partner_type": text(row.get("Jenis_Partner")) or None,
                "account_status": None,
                "data": row,
            })
        if rid in reward_ids:
            raise ValueError("Reward_ID duplikat ditemukan pada master.")
        reward_ids.add(rid)
        rewards.append({"id": rid, "store_id": sid, "period": period, "data": row})

    payload = {
        "sales": sales,
        "stores": [entry[1] for entry in stores_by_id.values()],
        "invoices": normalized_invoices,
        "targets": targets,
        "rewards": rewards,
    }
    for table in ("sales", "stores", "invoices", "targets", "rewards"):
        if any(not row.get("id") and table != "targets" for row in payload[table]):
            raise ValueError("Data " + table + " memuat ID kosong.")
    return payload


def request_json(path, payload, token=None, prefer=None):
    headers = {
        "apikey": PUBLISHABLE_KEY,
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = "Bearer " + token
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(
        PROJECT_URL + path,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read()
            return json.loads(body.decode("utf-8")) if body else None
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError("Supabase menolak impor pada " + path + ": " + details) from None


def upsert_table(token, table, rows, conflict):
    query = urllib.parse.urlencode({"on_conflict": conflict})
    path = "/rest/v1/" + table + "?" + query
    for start in range(0, len(rows), 100):
        request_json(path, rows[start:start + 100], token, "resolution=merge-duplicates,return=minimal")


def main():
    workbook_path = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_WORKBOOK
    if not workbook_path.is_file():
        raise FileNotFoundError("Workbook tidak ditemukan: " + str(workbook_path))

    payload = build_payload(workbook_path)
    print("Siap impor: " + ", ".join(table + "=" + str(len(rows)) for table, rows in payload.items()))
    password = getpass.getpass("Password akun Admin Supabase: ")
    auth = request_json(
        "/auth/v1/token?grant_type=password",
        {"email": "admin@fade.invalid", "password": password},
    )
    token = auth.get("access_token") if auth else None
    user_id = (auth.get("user") or {}).get("id") if auth else None
    if not token or not user_id:
        raise RuntimeError("Login Admin Supabase gagal.")

    profile_query = urllib.parse.urlencode({"select": "app_role", "user_id": "eq." + user_id})
    profile_request = urllib.request.Request(
        PROJECT_URL + "/rest/v1/fade_profiles?" + profile_query,
        headers={"apikey": PUBLISHABLE_KEY, "Authorization": "Bearer " + token},
    )
    with urllib.request.urlopen(profile_request, timeout=30) as response:
        profile = json.loads(response.read().decode("utf-8"))
    if not profile or profile[0].get("app_role") != "admin":
        raise RuntimeError("Akun yang dipakai tidak memiliki role Admin.")

    upsert_table(token, "fade_sales", payload["sales"], "id")
    upsert_table(token, "fade_stores", payload["stores"], "id")
    upsert_table(token, "fade_targets", payload["targets"], "sales_id,period")
    upsert_table(token, "fade_invoices", payload["invoices"], "id")
    upsert_table(token, "fade_rewards", payload["rewards"], "id")
    print("Impor selesai dengan akun Admin; tabel terproteksi RLS.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
