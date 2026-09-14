import { useEffect, useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { toast } from "react-hot-toast";

const API_BASE = "https://wallet-backend-pkxi.onrender.com";

export default function AdminWireSettingsPage() {
  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(false);

  const [form, setForm] = useState({
    minimumDeposit: "",
    recipientName: "",
    recipientAddress: "",
    recipientAccount: "",
    swiftBic: "",
    bankName: "",
    bankCountry: "",
    bankAddress: "",
    intermediaryBank: "",
    importantNotes: "",
  });

  const fetchWireDetails = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/deposit/wire-details`);
      const data = await res.json();

      if (data.success && data.data) {
        setForm({
          minimumDeposit: data.data.minimumDeposit || "",
          recipientName: data.data.recipientName || "",
          recipientAddress: data.data.recipientAddress || "",
          recipientAccount: data.data.recipientAccount || "",
          swiftBic: data.data.swiftBic || "",
          bankName: data.data.bankName || "",
          bankCountry: data.data.bankCountry || "",
          bankAddress: data.data.bankAddress || "",
          intermediaryBank: data.data.intermediaryBank || "",
          importantNotes: data.data.importantNotes || "",
        });

        setIsEnabled(data.data.isEnabled ?? true);
      }

      if (!data.success && data.maintenance) {
        setIsEnabled(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchWireDetails();
  }, []);

  const handleToggleWire = async () => {
    if (!token) return toast.error("Missing admin token");

    setToggleLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/admin/toggle-wire`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: !isEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Toggle failed");

      setIsEnabled(!isEnabled);
      toast.success(`Wire transfer ${!isEnabled ? "enabled" : "disabled"}`);
    } catch (err) {
      toast.error(err.message || "Error toggling wire");
    } finally {
      setToggleLoading(false);
    }
  };

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!token) return toast.error("Missing admin token");

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/admin/update-wire-details`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          minimumDeposit: Number(form.minimumDeposit || 0),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update");

      toast.success("Wire details updated successfully");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error updating wire details");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "mt-1 h-11 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500";

  const labelClass = "text-xs font-medium text-slate-600 dark:text-slate-300";

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-6 py-6 text-slate-900 dark:bg-[#030712] dark:text-slate-100">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#0F172A]">
        <h2 className="mb-5 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Wire Transfer Settings
        </h2>

        <div className="mb-6 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-[#020617]">
          <div>
            <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
              Wire Transfer Status
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Enable or disable wire deposits globally.
            </div>
          </div>

          <button
            onClick={handleToggleWire}
            disabled={toggleLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-60 ${
              isEnabled ? "bg-purple-600" : "bg-slate-300 dark:bg-slate-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                isEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Minimum Deposit</label>
            <Input
              className={inputClass}
              value={form.minimumDeposit}
              onChange={(e) => handleChange("minimumDeposit", e.target.value)}
              placeholder="e.g. 100"
            />
          </div>

          <div>
            <label className={labelClass}>Recipient Name</label>
            <Input
              className={inputClass}
              value={form.recipientName}
              onChange={(e) => handleChange("recipientName", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Recipient Account / IBAN</label>
            <Input
              className={inputClass}
              value={form.recipientAccount}
              onChange={(e) => handleChange("recipientAccount", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>SWIFT / BIC</label>
            <Input
              className={inputClass}
              value={form.swiftBic}
              onChange={(e) => handleChange("swiftBic", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Bank Name</label>
            <Input
              className={inputClass}
              value={form.bankName}
              onChange={(e) => handleChange("bankName", e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Bank Country</label>
            <Input
              className={inputClass}
              value={form.bankCountry}
              onChange={(e) => handleChange("bankCountry", e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Recipient Address</label>
            <Input
              className={inputClass}
              value={form.recipientAddress}
              onChange={(e) => handleChange("recipientAddress", e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Bank Address</label>
            <Input
              className={inputClass}
              value={form.bankAddress}
              onChange={(e) => handleChange("bankAddress", e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Intermediary Bank</label>
            <Input
              className={inputClass}
              value={form.intermediaryBank}
              onChange={(e) => handleChange("intermediaryBank", e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Important Notes</label>
            <Input
              className={inputClass}
              value={form.importantNotes}
              onChange={(e) => handleChange("importantNotes", e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6">
          <Button
            onClick={handleSave}
            disabled={loading}
            className="bg-purple-600 text-white hover:bg-purple-700"
          >
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}