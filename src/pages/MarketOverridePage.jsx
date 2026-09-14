import { useEffect, useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { toast } from "react-hot-toast";

const API_BASE = "https://wallet-backend-pkxi.onrender.com";

function fmtTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}

export default function MarketOverridePage() {
  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  // core
  const [fixedPrice, setFixedPrice] = useState("");
  const [minutes, setMinutes] = useState("2");

  // realism knobs (safe defaults)
  const [band, setBand] = useState("0.50"); // total width in quote (USDT)
  const [stepMin, setStepMin] = useState("0.01");
  const [stepMax, setStepMax] = useState("0.06");
  const [flipProb, setFlipProb] = useState("0.25");
  const [meanRevert, setMeanRevert] = useState("0.15");
  const [shockProb, setShockProb] = useState("0.02");
  const [shockSize, setShockSize] = useState("0.25");
  const [volMin, setVolMin] = useState("1");
  const [volMax, setVolMax] = useState("25");

  // optional: expose these too (only works if backend accepts)
  const [wickPct, setWickPct] = useState("0.001");
  const [blendMinutes, setBlendMinutes] = useState("5");

  const fetchStatus = async () => {
    if (!token) {
      toast.error("No admin token found. Please login again.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/market-override`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to load status");
      setStatus(j?.data || null);

      // if backend returns values, sync form defaults once
      const s = j?.data;
      if (s) {
        if (s.band != null) setBand(String(s.band));
        if (s.stepMin != null) setStepMin(String(s.stepMin));
        if (s.stepMax != null) setStepMax(String(s.stepMax));
        if (s.flipProb != null) setFlipProb(String(s.flipProb));
        if (s.meanRevert != null) setMeanRevert(String(s.meanRevert));
        if (s.shockProb != null) setShockProb(String(s.shockProb));
        if (s.shockSize != null) setShockSize(String(s.shockSize));
        if (s.volMin != null) setVolMin(String(s.volMin));
        if (s.volMax != null) setVolMax(String(s.volMax));
        if (s.wickPct != null) setWickPct(String(s.wickPct));
        if (s.blendMinutes != null) setBlendMinutes(String(s.blendMinutes));
      }
    } catch (e) {
      toast.error(e?.message || "Failed to load status");
    } finally {
      setLoading(false);
    }
  };

  const validate = () => {
    const fp = n(fixedPrice);
    const min = n(minutes);

    const _band = n(band);
    const _stepMin = n(stepMin);
    const _stepMax = n(stepMax);
    const _flipProb = n(flipProb);
    const _meanRevert = n(meanRevert);
    const _shockProb = n(shockProb);
    const _shockSize = n(shockSize);
    const _volMin = n(volMin);
    const _volMax = n(volMax);

    const _wickPct = n(wickPct);
    const _blendMinutes = n(blendMinutes);

    if (!Number.isFinite(fp) || fp <= 0) return { ok: false, msg: "Bad fixed price" };
    if (!Number.isFinite(min) || min <= 0) return { ok: false, msg: "Bad minutes" };

    if (!Number.isFinite(_band) || _band <= 0) return { ok: false, msg: "Bad band" };

    if (!Number.isFinite(_stepMin) || _stepMin <= 0) return { ok: false, msg: "Bad stepMin" };
    if (!Number.isFinite(_stepMax) || _stepMax <= 0) return { ok: false, msg: "Bad stepMax" };
    if (_stepMax < _stepMin) return { ok: false, msg: "stepMax must be >= stepMin" };

    const probFields = [
      ["flipProb", _flipProb],
      ["meanRevert", _meanRevert],
      ["shockProb", _shockProb],
    ];
    for (const [k, v] of probFields) {
      if (!Number.isFinite(v) || v < 0 || v > 1) return { ok: false, msg: `Bad ${k} (0..1)` };
    }

    if (!Number.isFinite(_shockSize) || _shockSize < 0) return { ok: false, msg: "Bad shockSize" };

    if (!Number.isFinite(_volMin) || _volMin < 0) return { ok: false, msg: "Bad volMin" };
    if (!Number.isFinite(_volMax) || _volMax < 0) return { ok: false, msg: "Bad volMax" };
    if (_volMax < _volMin) return { ok: false, msg: "volMax must be >= volMin" };

    if (!Number.isFinite(_wickPct) || _wickPct < 0) return { ok: false, msg: "Bad wickPct" };
    if (!Number.isFinite(_blendMinutes) || _blendMinutes < 0)
      return { ok: false, msg: "Bad blendMinutes" };

    return {
      ok: true,
      payload: {
        fixedPrice: fp,
        minutes: min,

        // realism knobs
        band: _band,
        stepMin: _stepMin,
        stepMax: _stepMax,
        flipProb: _flipProb,
        meanRevert: _meanRevert,
        shockProb: _shockProb,
        shockSize: _shockSize,
        volMin: _volMin,
        volMax: _volMax,

        // optional (only if backend uses them)
        wickPct: _wickPct,
        blendMinutes: _blendMinutes,
      },
    };
  };

  const startOverride = async () => {
    if (!token) return toast.error("No admin token found. Please login again.");

    const v = validate();
    if (!v.ok) return toast.error(v.msg);

    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/market-override/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(v.payload),
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to start override");

      toast.success("Override started");
      setStatus(j?.data || null);
    } catch (e) {
      toast.error(e?.message || "Failed to start override");
    } finally {
      setLoading(false);
    }
  };

  const stopOverride = async () => {
    if (!token) return toast.error("No admin token found. Please login again.");

    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/market-override/stop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to stop override");

      toast.success("Override stopped");
      setStatus(j?.data || null);
    } catch (e) {
      toast.error(e?.message || "Failed to stop override");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isActive = Boolean(status?.isActive);
  const instId = status?.instId || "NEX-USDT";

  return (
    <div className="p-4 space-y-4">

      {/* Status */}
      <div className="rounded-xl border p-4 space-y-2">
        <div className="font-semibold">Status</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div>
            <span className="opacity-70">Active:</span>{" "}
            <span className={isActive ? "text-green-500" : "text-red-500"}>
              {isActive ? "YES" : "NO"}
            </span>
          </div>

          <div>
            <span className="opacity-70">Pair:</span>{" "}
            <span className="font-mono">{instId}</span>
          </div>

          <div>
            <span className="opacity-70">Fixed Price:</span>{" "}
            <span className="font-mono">{status?.fixedPrice ?? "-"}</span>
          </div>

          <div>
            <span className="opacity-70">Band:</span>{" "}
            <span className="font-mono">{status?.band ?? "-"}</span>
          </div>

          <div>
            <span className="opacity-70">Step:</span>{" "}
            <span className="font-mono">
              {status?.stepMin ?? "-"} .. {status?.stepMax ?? "-"}
            </span>
          </div>

          <div>
            <span className="opacity-70">Flip Prob:</span>{" "}
            <span className="font-mono">{status?.flipProb ?? "-"}</span>
          </div>

          <div>
            <span className="opacity-70">Mean Revert:</span>{" "}
            <span className="font-mono">{status?.meanRevert ?? "-"}</span>
          </div>

          <div>
            <span className="opacity-70">Shock:</span>{" "}
            <span className="font-mono">
              {status?.shockProb ?? "-"} @ {status?.shockSize ?? "-"}
            </span>
          </div>

          <div>
            <span className="opacity-70">Vol Range:</span>{" "}
            <span className="font-mono">
              {status?.volMin ?? "-"} .. {status?.volMax ?? "-"}
            </span>
          </div>

          <div>
            <span className="opacity-70">Wick %:</span>{" "}
            <span className="font-mono">
              {status?.wickPct != null ? `${status.wickPct * 100}%` : "-"}
            </span>
          </div>

          <div>
            <span className="opacity-70">Blend Minutes:</span>{" "}
            <span className="font-mono">{status?.blendMinutes ?? "-"}</span>
          </div>

          <div>
            <span className="opacity-70">Start:</span> {fmtTime(status?.startAt)}
          </div>
          <div>
            <span className="opacity-70">End:</span> {fmtTime(status?.endAt)}
          </div>
        </div>

        <div className="pt-2 flex gap-2">
          <Button variant="destructive" onClick={stopOverride} disabled={loading || !isActive}>
            Stop Override
          </Button>

          <Button onClick={fetchStatus} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Start override */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="font-semibold">Start Override</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <div className="text-xs opacity-70 mb-1">Fixed Price</div>
            <Input
              value={fixedPrice}
              onChange={(e) => setFixedPrice(e.target.value)}
              placeholder="e.g. 999"
            />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-1">Minutes</div>
            <Input value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="e.g. 2" />
          </div>

          <div className="flex items-end">
            <Button onClick={startOverride} disabled={loading} className="w-full">
              Start
            </Button>
          </div>
        </div>

        <div className="pt-3 border-t" />

        <div className="font-semibold text-sm">Realism Controls</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <div className="text-xs opacity-70 mb-1">Band (total width)</div>
            <Input value={band} onChange={(e) => setBand(e.target.value)} placeholder="0.50" />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-1">Step Min</div>
            <Input value={stepMin} onChange={(e) => setStepMin(e.target.value)} placeholder="0.01" />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-1">Step Max</div>
            <Input value={stepMax} onChange={(e) => setStepMax(e.target.value)} placeholder="0.06" />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-1">Flip Prob (0..1)</div>
            <Input value={flipProb} onChange={(e) => setFlipProb(e.target.value)} placeholder="0.25" />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-1">Mean Revert (0..1)</div>
            <Input
              value={meanRevert}
              onChange={(e) => setMeanRevert(e.target.value)}
              placeholder="0.15"
            />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-1">Shock Prob (0..1)</div>
            <Input value={shockProb} onChange={(e) => setShockProb(e.target.value)} placeholder="0.02" />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-1">Shock Size</div>
            <Input value={shockSize} onChange={(e) => setShockSize(e.target.value)} placeholder="0.25" />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-1">Vol Min</div>
            <Input value={volMin} onChange={(e) => setVolMin(e.target.value)} placeholder="1" />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-1">Vol Max</div>
            <Input value={volMax} onChange={(e) => setVolMax(e.target.value)} placeholder="25" />
          </div>
        </div>

        <div className="pt-3 border-t" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <div className="text-xs opacity-70 mb-1">Wick Pct</div>
            <Input value={wickPct} onChange={(e) => setWickPct(e.target.value)} placeholder="0.001" />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-1">Blend Minutes</div>
            <Input
              value={blendMinutes}
              onChange={(e) => setBlendMinutes(e.target.value)}
              placeholder="5"
            />
          </div>
        </div>

        <div className="text-xs opacity-70">
          Band/step/flip/revert/shock make the chart look alive while still staying near your fixed price.
        </div>
      </div>
    </div>
  );
}
