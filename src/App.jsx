import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Calculator,
  Coins,
  Download,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Edit3,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Archive,
  Tag,
  CheckCircle2,
  Image as ImageIcon,
} from "lucide-react";

const STORAGE_KEY = "cost-calculator-records-v1";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 0,
  }).format(Math.round(toNumber(value)));
}

function formatPercent(value) {
  return `${toNumber(value).toFixed(2)}%`;
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function makeEmptyProduct(index = 1) {
  return {
    id: uid(),
    name: `상품 ${index}`,
    sku: "",
    imageUrl: "",
    qty: "1",
    buyUsd: "0",
    buyCny: "0",
    salePrice: "0",
    salesStatus: "미판매",
    restockStatus: "보통",
  };
}

function makeSampleProducts() {
  return [
    {
      id: uid(),
      name: "포스터 A",
      sku: "POSTER-A-50X70",
      imageUrl: "",
      qty: "2",
      buyUsd: "0",
      buyCny: "13",
      salePrice: "29900",
      salesStatus: "판매중",
      restockStatus: "보통",
    },
    {
      id: uid(),
      name: "포스터 B",
      sku: "POSTER-B-60X80",
      imageUrl: "",
      qty: "2",
      buyUsd: "0",
      buyCny: "18",
      salePrice: "34900",
      salesStatus: "미판매",
      restockStatus: "재주문 필요",
    },
  ];
}

function calculateRows(products, shared) {
  const usdRate = toNumber(shared.usdRate);
  const cnyRate = toNumber(shared.cnyRate);
  const overseasShipping = toNumber(shared.overseasShipping);
  const domesticShipping = toNumber(shared.domesticShipping);
  const packagingCost = toNumber(shared.packagingCost);
  const adCostFixed = toNumber(shared.adCostFixed);
  const smartStoreFeeRate = toNumber(shared.smartStoreFeeRate) / 100;
  const adCostRate = toNumber(shared.adCostRate) / 100;
  const simpleVatRate = toNumber(shared.simpleVatRate) / 100;

  const baseRows = products.map((item) => {
    const qty = Math.max(1, toNumber(item.qty));
    const buyUsd = toNumber(item.buyUsd);
    const buyCny = toNumber(item.buyCny);
    const salePrice = toNumber(item.salePrice);

    const unitBuyCostKrw = buyUsd * usdRate + buyCny * cnyRate;
    const totalBuyCostKrw = unitBuyCostKrw * qty;

    return {
      ...item,
      qty,
      buyUsd,
      buyCny,
      salePrice,
      unitBuyCostKrw,
      totalBuyCostKrw,
    };
  });

  const totalQty = baseRows.reduce((sum, row) => sum + row.qty, 0);
  const totalBuyCost = baseRows.reduce((sum, row) => sum + row.totalBuyCostKrw, 0);

  const domesticPerUnit = totalQty > 0 ? domesticShipping / totalQty : 0;
  const packagingPerUnit = totalQty > 0 ? packagingCost / totalQty : 0;
  const fixedAdPerUnit = totalQty > 0 ? adCostFixed / totalQty : 0;

  const rows = baseRows.map((row) => {
    const buyRatio = totalBuyCost > 0 ? row.totalBuyCostKrw / totalBuyCost : 0;
    const overseasAllocatedTotal = overseasShipping * buyRatio;
    const overseasAllocatedPerUnit = row.qty > 0 ? overseasAllocatedTotal / row.qty : 0;

    const smartStoreFeePerUnit = row.salePrice * smartStoreFeeRate;
    const adCostPerUnit = row.salePrice * adCostRate;
    const simpleVatPerUnit = row.salePrice * simpleVatRate * 0.1;

    const totalCostPerUnit =
      row.unitBuyCostKrw +
      overseasAllocatedPerUnit +
      domesticPerUnit +
      packagingPerUnit +
      fixedAdPerUnit +
      smartStoreFeePerUnit +
      adCostPerUnit +
      simpleVatPerUnit;

    const totalCostAll = totalCostPerUnit * row.qty;
    const revenueAll = row.salePrice * row.qty;
    const profitPerUnit = row.salePrice - totalCostPerUnit;
    const profitAll = revenueAll - totalCostAll;
    const marginRate = row.salePrice > 0 ? (profitPerUnit / row.salePrice) * 100 : 0;
    const costRate = row.salePrice > 0 ? (totalCostPerUnit / row.salePrice) * 100 : 0;

    const target30 = totalCostPerUnit / 0.7;
    const target40 = totalCostPerUnit / 0.6;

    return {
      ...row,
      buyRatio,
      overseasAllocatedTotal,
      overseasAllocatedPerUnit,
      domesticPerUnit,
      packagingPerUnit,
      fixedAdPerUnit,
      smartStoreFeePerUnit,
      adCostPerUnit,
      simpleVatPerUnit,
      totalCostPerUnit,
      totalCostAll,
      revenueAll,
      profitPerUnit,
      profitAll,
      marginRate,
      costRate,
      target30,
      target40,
    };
  });

  const summary = {
    totalQty,
    totalBuyCost,
    totalRevenue: rows.reduce((sum, row) => sum + row.revenueAll, 0),
    totalCost: rows.reduce((sum, row) => sum + row.totalCostAll, 0),
    totalProfit: rows.reduce((sum, row) => sum + row.profitAll, 0),
  };

  summary.costRate =
    summary.totalRevenue > 0 ? (summary.totalCost / summary.totalRevenue) * 100 : 0;
  summary.marginRate =
    summary.totalRevenue > 0 ? (summary.totalProfit / summary.totalRevenue) * 100 : 0;

  return { rows, summary };
}

function exportToCsv(records) {
  const headers = [
    "묶음명",
    "매입일",
    "저장일",
    "상품명",
    "SKU",
    "판매상태",
    "재주문상태",
    "수량",
    "판매가",
    "개당매입원가",
    "개당총원가",
    "총매출",
    "총원가",
    "개당순이익",
    "총순이익",
    "원가율",
    "마진율",
    "이미지URL",
  ];

  const lines = [headers.join(",")];

  records.forEach((record) => {
    record.items.forEach((item) => {
      lines.push(
        [
          record.bundleName,
          record.purchaseDate,
          record.savedAt,
          item.name,
          item.sku || "",
          item.salesStatus || "미판매",
          item.restockStatus || "보통",
          item.qty,
          item.salePrice,
          Math.round(item.unitBuyCostKrw),
          Math.round(item.totalCostPerUnit),
          Math.round(item.revenueAll),
          Math.round(item.totalCostAll),
          Math.round(item.profitPerUnit),
          Math.round(item.profitAll),
          item.costRate.toFixed(2),
          item.marginRate.toFixed(2),
          item.imageUrl || "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      );
    });
  });

  downloadFile(
    `원가계산기록_${new Date().toISOString().slice(0, 10)}.csv`,
    lines.join("\n"),
    "text/csv;charset=utf-8;"
  );
}

function exportToXlsx(records) {
  const workbook = XLSX.utils.book_new();

  const summaryRows = records.map((record) => ({
    묶음명: record.bundleName,
    매입일: record.purchaseDate,
    저장일: record.savedAt,
    상품종수: record.items.length,
    총수량: record.summary.totalQty,
    전체매출: Math.round(record.summary.totalRevenue),
    전체원가: Math.round(record.summary.totalCost),
    전체순이익: Math.round(record.summary.totalProfit),
    전체원가율: Number(record.summary.costRate.toFixed(2)),
    전체마진율: Number(record.summary.marginRate.toFixed(2)),
  }));

  const detailRows = records.flatMap((record) =>
    record.items.map((item) => ({
      묶음명: record.bundleName,
      매입일: record.purchaseDate,
      저장일: record.savedAt,
      상품명: item.name,
      SKU: item.sku || "",
      판매상태: item.salesStatus || "미판매",
      재주문상태: item.restockStatus || "보통",
      수량: item.qty,
      판매가: Math.round(item.salePrice),
      개당매입원가: Math.round(item.unitBuyCostKrw),
      개당총원가: Math.round(item.totalCostPerUnit),
      총매출: Math.round(item.revenueAll),
      총원가: Math.round(item.totalCostAll),
      개당순이익: Math.round(item.profitPerUnit),
      총순이익: Math.round(item.profitAll),
      원가율: Number(item.costRate.toFixed(2)),
      마진율: Number(item.marginRate.toFixed(2)),
      이미지URL: item.imageUrl || "",
    }))
  );

  const ws1 = XLSX.utils.json_to_sheet(summaryRows);
  const ws2 = XLSX.utils.json_to_sheet(detailRows);

  XLSX.utils.book_append_sheet(workbook, ws1, "요약");
  XLSX.utils.book_append_sheet(workbook, ws2, "상품상세");

  XLSX.writeFile(
    workbook,
    `원가계산기록_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

function InputField({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  type = "text",
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-slate-700">{label}</div>
      <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition focus-within:border-slate-400">
        <input
          type={type}
          inputMode={type === "number" ? "decimal" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-base outline-none"
        />
        {suffix && <span className="ml-3 whitespace-nowrap text-sm text-slate-500">{suffix}</span>}
      </div>
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-slate-700">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none shadow-sm"
      >
        {options.map((option) => {
          const val = typeof option === "string" ? option : option.value;
          const text = typeof option === "string" ? option : option.label;
          return (
            <option key={val} value={val}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function SummaryCard({ title, value, sub, icon: Icon }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-500">{title}</div>
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
      <div className="text-2xl font-bold tracking-tight text-slate-900">{value}</div>
      {sub && <div className="mt-2 text-sm text-slate-500">{sub}</div>}
    </div>
  );
}

export default function App() {
  const today = new Date().toISOString().slice(0, 10);

  const [bundleName, setBundleName] = useState("4월 포스터 합배송 1차");
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [usdRate, setUsdRate] = useState("1380");
  const [cnyRate, setCnyRate] = useState("190");
  const [overseasShipping, setOverseasShipping] = useState("22000");
  const [domesticShipping, setDomesticShipping] = useState("4000");
  const [packagingCost, setPackagingCost] = useState("6000");
  const [adCostFixed, setAdCostFixed] = useState("3000");
  const [smartStoreFeeRate, setSmartStoreFeeRate] = useState("2");
  const [adCostRate, setAdCostRate] = useState("3");
  const [simpleVatRate, setSimpleVatRate] = useState("15");

  const [products, setProducts] = useState(makeSampleProducts());
  const [savedRecords, setSavedRecords] = useState([]);
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [isFetchingRates, setIsFetchingRates] = useState(false);
  const [rateMessage, setRateMessage] = useState("");
  const [expandedIds, setExpandedIds] = useState({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedRecords(parsed);
      }
    } catch (error) {
      console.error("저장 기록 불러오기 실패", error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRecords));
  }, [savedRecords]);

  const sharedInput = useMemo(
    () => ({
      usdRate,
      cnyRate,
      overseasShipping,
      domesticShipping,
      packagingCost,
      adCostFixed,
      smartStoreFeeRate,
      adCostRate,
      simpleVatRate,
    }),
    [
      usdRate,
      cnyRate,
      overseasShipping,
      domesticShipping,
      packagingCost,
      adCostFixed,
      smartStoreFeeRate,
      adCostRate,
      simpleVatRate,
    ]
  );

  const result = useMemo(() => calculateRows(products, sharedInput), [products, sharedInput]);

  const filteredRecords = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return savedRecords;

    return savedRecords.filter((record) => {
      const target = [
        record.bundleName,
        record.purchaseDate,
        ...(record.items || []).flatMap((item) => [item.name, item.sku, item.imageUrl]),
      ]
        .join(" ")
        .toLowerCase();

      return target.includes(keyword);
    });
  }, [savedRecords, searchKeyword]);

  const fetchRates = async () => {
    try {
      setIsFetchingRates(true);
      setRateMessage("");

      const [usdRes, cnyRes] = await Promise.all([
        fetch("https://api.frankfurter.dev/v2/rate/USD/KRW"),
        fetch("https://api.frankfurter.dev/v2/rate/CNY/KRW"),
      ]);

      if (!usdRes.ok || !cnyRes.ok) {
        throw new Error("환율 정보를 불러오지 못했습니다.");
      }

      const usdData = await usdRes.json();
      const cnyData = await cnyRes.json();

      if (!usdData?.rate || !cnyData?.rate) {
        throw new Error("환율 데이터 형식이 올바르지 않습니다.");
      }

      setUsdRate(String(Math.round(usdData.rate)));
      setCnyRate(String(Math.round(cnyData.rate)));
      setRateMessage(`환율 반영 완료 (${new Date().toLocaleString("ko-KR")})`);
    } catch (error) {
      setRateMessage(error.message || "환율 반영 실패");
    } finally {
      setIsFetchingRates(false);
    }
  };

  const resetForm = () => {
    setBundleName("4월 포스터 합배송 1차");
    setPurchaseDate(today);
    setUsdRate("1380");
    setCnyRate("190");
    setOverseasShipping("22000");
    setDomesticShipping("4000");
    setPackagingCost("6000");
    setAdCostFixed("3000");
    setSmartStoreFeeRate("2");
    setAdCostRate("3");
    setSimpleVatRate("15");
    setProducts(makeSampleProducts());
    setEditingRecordId(null);
  };

  const updateProduct = (id, key, value) => {
    setProducts((prev) => prev.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  };

  const addProduct = () => {
    setProducts((prev) => [...prev, makeEmptyProduct(prev.length + 1)]);
  };

  const removeProduct = (id) => {
    setProducts((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)));
  };

  const saveRecord = () => {
    const payload = {
      id: editingRecordId || uid(),
      bundleName: bundleName.trim() || "이름 없는 묶음",
      purchaseDate,
      sharedInput,
      items: result.rows,
      summary: result.summary,
      sourceProducts: products,
      savedAt: new Date().toLocaleString("ko-KR"),
    };

    if (editingRecordId) {
      setSavedRecords((prev) =>
        prev.map((record) => (record.id === editingRecordId ? payload : record))
      );
    } else {
      setSavedRecords((prev) => [payload, ...prev]);
    }

    setEditingRecordId(payload.id);
    alert("저장되었습니다.");
  };

  const editRecord = (id) => {
    const record = savedRecords.find((item) => item.id === id);
    if (!record) return;

    setEditingRecordId(record.id);
    setBundleName(record.bundleName || "");
    setPurchaseDate(record.purchaseDate || today);

    setUsdRate(record.sharedInput.usdRate || "0");
    setCnyRate(record.sharedInput.cnyRate || "0");
    setOverseasShipping(record.sharedInput.overseasShipping || "0");
    setDomesticShipping(record.sharedInput.domesticShipping || "0");
    setPackagingCost(record.sharedInput.packagingCost || "0");
    setAdCostFixed(record.sharedInput.adCostFixed || "0");
    setSmartStoreFeeRate(record.sharedInput.smartStoreFeeRate || "0");
    setAdCostRate(record.sharedInput.adCostRate || "0");
    setSimpleVatRate(record.sharedInput.simpleVatRate || "15");

    setProducts(
      (record.sourceProducts || []).map((item) => ({
        ...item,
        id: item.id || uid(),
      }))
    );

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteRecord = (id) => {
    const ok = window.confirm("정말 삭제하시겠습니까?");
    if (!ok) return;

    setSavedRecords((prev) => prev.filter((record) => record.id !== id));

    if (editingRecordId === id) {
      resetForm();
    }
  };

  const toggleExpand = (id) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 rounded-[28px] bg-gradient-to-r from-slate-900 to-slate-700 p-7 text-white shadow-xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-slate-200">
              <Archive className="h-4 w-4" />
              PWA 원가 계산 앱
            </div>
            <h1 className="text-3xl font-bold tracking-tight">합배송 원가 계산 앱</h1>
            <p className="mt-2 text-sm text-slate-200 md:text-base">
              환율, 국제배송비, 국내배송비, 포장비, 광고비, 스마트스토어 수수료를
              반영해서 상품별 원가율과 마진율을 계산하고 저장할 수 있습니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchRates}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-400"
            >
              <RefreshCw className={`h-4 w-4 ${isFetchingRates ? "animate-spin" : ""}`} />
              {isFetchingRates ? "환율 불러오는 중" : "오늘 환율 반영"}
            </button>
            <button
              onClick={() => exportToCsv(filteredRecords)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
            <button
              onClick={() => exportToXlsx(filteredRecords)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20"
            >
              <Download className="h-4 w-4" />
              XLSX
            </button>
            <button
              onClick={resetForm}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20"
            >
              <RotateCcw className="h-4 w-4" />
              새 작업
            </button>
          </div>
        </div>

        {rateMessage ? (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            {rateMessage}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <SummaryCard
            title="현재 전체 매출"
            value={`${formatNumber(result.summary.totalRevenue)}원`}
            sub={`총 수량 ${formatNumber(result.summary.totalQty)}개`}
            icon={Coins}
          />
          <SummaryCard
            title="현재 전체 원가"
            value={`${formatNumber(result.summary.totalCost)}원`}
            sub={`원가율 ${formatPercent(result.summary.costRate)}`}
            icon={Calculator}
          />
          <SummaryCard
            title="현재 전체 순이익"
            value={`${formatNumber(result.summary.totalProfit)}원`}
            sub={`마진율 ${formatPercent(result.summary.marginRate)}`}
            icon={Package}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-xl font-bold">기본 정보</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <InputField
                  label="묶음명"
                  value={bundleName}
                  onChange={setBundleName}
                  placeholder="예: 4월 포스터 합배송 1차"
                />
                <InputField
                  label="매입일"
                  value={purchaseDate}
                  onChange={setPurchaseDate}
                  type="date"
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-xl font-bold">공통 비용 설정</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <InputField label="달러 환율" value={usdRate} onChange={setUsdRate} suffix="원" />
                <InputField label="위안 환율" value={cnyRate} onChange={setCnyRate} suffix="원" />
                <InputField
                  label="국제배송비"
                  value={overseasShipping}
                  onChange={setOverseasShipping}
                  suffix="원"
                />
                <InputField
                  label="국내배송비"
                  value={domesticShipping}
                  onChange={setDomesticShipping}
                  suffix="원"
                />
                <InputField
                  label="포장비"
                  value={packagingCost}
                  onChange={setPackagingCost}
                  suffix="원"
                />
                <InputField
                  label="정액 광고비"
                  value={adCostFixed}
                  onChange={setAdCostFixed}
                  suffix="원"
                />
                <InputField
                  label="스마트스토어 수수료율"
                  value={smartStoreFeeRate}
                  onChange={setSmartStoreFeeRate}
                  suffix="%"
                />
                <InputField
                  label="광고비율"
                  value={adCostRate}
                  onChange={setAdCostRate}
                  suffix="%"
                />
                <InputField
                  label="간이과세 부가가치율"
                  value={simpleVatRate}
                  onChange={setSimpleVatRate}
                  suffix="%"
                />
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                국제배송비는 상품 매입금액 비율로 배분되고, 국내배송비·포장비·정액 광고비는
                전체 수량 기준으로 균등 배분됩니다.
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">상품 목록</h2>
                <button
                  onClick={addProduct}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  상품 추가
                </button>
              </div>

              <div className="space-y-4">
                {products.map((product, index) => (
                  <div key={product.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-700">상품 {index + 1}</div>
                      <button
                        onClick={() => removeProduct(product.id)}
                        className="inline-flex items-center gap-1 text-sm text-rose-500 transition hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                        삭제
                      </button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <InputField
                        label="상품명"
                        value={product.name}
                        onChange={(value) => updateProduct(product.id, "name", value)}
                        placeholder="상품명"
                      />
                      <InputField
                        label="SKU"
                        value={product.sku}
                        onChange={(value) => updateProduct(product.id, "sku", value)}
                        placeholder="예: POSTER-A-50X70"
                      />
                      <InputField
                        label="이미지 URL"
                        value={product.imageUrl}
                        onChange={(value) => updateProduct(product.id, "imageUrl", value)}
                        placeholder="https://..."
                      />
                      <InputField
                        label="수량"
                        value={product.qty}
                        onChange={(value) => updateProduct(product.id, "qty", value)}
                        suffix="개"
                      />
                      <InputField
                        label="개당 매입가 (USD)"
                        value={product.buyUsd}
                        onChange={(value) => updateProduct(product.id, "buyUsd", value)}
                        suffix="$"
                      />
                      <InputField
                        label="개당 매입가 (CNY)"
                        value={product.buyCny}
                        onChange={(value) => updateProduct(product.id, "buyCny", value)}
                        suffix="¥"
                      />
                      <InputField
                        label="판매가"
                        value={product.salePrice}
                        onChange={(value) => updateProduct(product.id, "salePrice", value)}
                        suffix="원"
                      />
                      <SelectField
                        label="판매 상태"
                        value={product.salesStatus}
                        onChange={(value) => updateProduct(product.id, "salesStatus", value)}
                        options={["미판매", "판매중", "판매완료"]}
                      />
                      <SelectField
                        label="재주문 상태"
                        value={product.restockStatus}
                        onChange={(value) => updateProduct(product.id, "restockStatus", value)}
                        options={["보통", "재주문 필요", "재주문 완료"]}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={saveRecord}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  <Save className="h-4 w-4" />
                  {editingRecordId ? "수정 저장" : "현재 묶음 저장"}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-xl font-bold">현재 계산 결과</h2>

              <div className="space-y-4">
                {result.rows.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {row.imageUrl ? (
                          <img src={row.imageUrl} alt={row.name} className="h-12 w-12 rounded-xl object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900">{row.name}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              {row.sku || "SKU 없음"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              {row.salesStatus || "미판매"}
                            </span>
                            <span>{row.restockStatus || "보통"}</span>
                          </div>
                        </div>
                      </div>
                      <div
                        className={`rounded-2xl px-4 py-3 text-right text-lg font-bold ${
                          row.profitPerUnit >= 0
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-rose-50 text-rose-600"
                        }`}
                      >
                        {formatNumber(row.profitPerUnit)}원
                        <div className="text-xs font-medium text-slate-500">개당 순이익</div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                        <div className="mb-2 font-semibold text-slate-700">개당 비용 요약</div>
                        <div className="flex justify-between py-1">
                          <span>개당 매입원가</span>
                          <strong>{formatNumber(row.unitBuyCostKrw)}원</strong>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>개당 총원가</span>
                          <strong>{formatNumber(row.totalCostPerUnit)}원</strong>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>원가율</span>
                          <strong>{formatPercent(row.costRate)}</strong>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>마진율</span>
                          <strong>{formatPercent(row.marginRate)}</strong>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                        <div className="mb-2 font-semibold text-slate-700">목표 판매가</div>
                        <div className="flex justify-between py-1">
                          <span>30% 마진 목표</span>
                          <strong>{formatNumber(row.target30)}원</strong>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>40% 마진 목표</span>
                          <strong>{formatNumber(row.target40)}원</strong>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>총 순이익</span>
                          <strong>{formatNumber(row.profitAll)}원</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-col gap-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <h2 className="text-xl font-bold">저장된 기록</h2>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => exportToCsv(filteredRecords)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4" />
                      CSV
                    </button>
                    <button
                      onClick={() => exportToXlsx(filteredRecords)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4" />
                      XLSX
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="묶음명, 날짜, 상품명, SKU, 이미지 URL 검색"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {filteredRecords.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
                    저장된 기록이 없습니다.
                  </div>
                ) : (
                  filteredRecords.map((record) => {
                    const expanded = !!expandedIds[record.id];

                    return (
                      <div key={record.id} className="rounded-2xl border border-slate-200 p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-lg font-bold text-slate-900">{record.bundleName}</div>
                            <div className="mt-2 text-sm text-slate-500">
                              매입일 {record.purchaseDate} · 저장일 {record.savedAt}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => toggleExpand(record.id)}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              {expanded ? "접기" : "상세"}
                            </button>
                            <button
                              onClick={() => editRecord(record.id)}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              <Edit3 className="h-4 w-4" />
                              수정
                            </button>
                            <button
                              onClick={() => deleteRecord(record.id)}
                              className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              삭제
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm md:grid-cols-4">
                          <div>
                            <div className="text-slate-500">총수량</div>
                            <div className="mt-1 font-bold text-slate-900">
                              {formatNumber(record.summary.totalQty)}개
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500">전체매출</div>
                            <div className="mt-1 font-bold text-slate-900">
                              {formatNumber(record.summary.totalRevenue)}원
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500">전체원가</div>
                            <div className="mt-1 font-bold text-slate-900">
                              {formatNumber(record.summary.totalCost)}원
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500">전체순이익</div>
                            <div className="mt-1 font-bold text-slate-900">
                              {formatNumber(record.summary.totalProfit)}원
                            </div>
                          </div>
                        </div>

                        {expanded ? (
                          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600">
                                  <tr>
                                    <th className="px-4 py-3 text-left">상품명</th>
                                    <th className="px-4 py-3 text-left">SKU</th>
                                    <th className="px-4 py-3 text-left">수량</th>
                                    <th className="px-4 py-3 text-left">판매가</th>
                                    <th className="px-4 py-3 text-left">개당총원가</th>
                                    <th className="px-4 py-3 text-left">원가율</th>
                                    <th className="px-4 py-3 text-left">마진율</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {record.items.map((item) => (
                                    <tr key={item.id} className="border-t border-slate-100">
                                      <td className="px-4 py-3">{item.name}</td>
                                      <td className="px-4 py-3">{item.sku || "-"}</td>
                                      <td className="px-4 py-3">{formatNumber(item.qty)}</td>
                                      <td className="px-4 py-3">{formatNumber(item.salePrice)}원</td>
                                      <td className="px-4 py-3">{formatNumber(item.totalCostPerUnit)}원</td>
                                      <td className="px-4 py-3">{formatPercent(item.costRate)}</td>
                                      <td className="px-4 py-3">{formatPercent(item.marginRate)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}