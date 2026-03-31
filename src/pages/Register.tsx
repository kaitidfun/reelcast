import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Sparkles, Mail, Lock, User, ArrowRight, Store, TrendingUp, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

const roles = [
  { id: "merchant", label: "Online Merchant", icon: Store, desc: "ผู้ค้าออนไลน์" },
  { id: "affiliate", label: "Affiliate Marketer", icon: TrendingUp, desc: "นักการตลาด Affiliate" },
  { id: "brand", label: "Brand Owner", icon: Briefcase, desc: "เจ้าของแบรนด์" },
];

const Register = () => {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState("merchant");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!displayName || !email || !password) {
      setError("กรุณากรอกข้อมูลให้ครบ");
      return;
    }
    if (password !== confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน");
      return;
    }
    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) {
      navigate("/", { replace: true });
    } else {
      setError("สมัครสมาชิกไม่สำเร็จ");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="gradient-glow pointer-events-none fixed inset-0" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-glow-lg">
            <Sparkles className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">ReelCast</h1>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mt-1">สร้างบัญชีใหม่</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-elevated">
          <h2 className="text-lg font-semibold text-foreground mb-1">สมัครสมาชิก</h2>
          <p className="text-sm text-muted-foreground mb-5">กรอกข้อมูลเพื่อเริ่มใช้งาน ReelCast</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Role Selection */}
            <div className="space-y-2">
              <Label>ประเภทผู้ใช้งาน</Label>
              <div className="grid grid-cols-3 gap-2">
                {roles.map((r) => {
                  const Icon = r.icon;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRole(r.id)}
                      className={`rounded-xl border p-3 text-center transition-all ${
                        selectedRole === r.id
                          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-primary/20"
                      }`}
                    >
                      <Icon className={`mx-auto h-4 w-4 mb-1 ${selectedRole === r.id ? "text-primary" : "text-muted-foreground"}`} />
                      <p className="text-[10px] font-medium text-foreground">{r.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">ชื่อที่แสดง</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="pl-10" placeholder="ชื่อของคุณ" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">อีเมล</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" placeholder="email@example.com" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="password">รหัสผ่าน</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" placeholder="••••••" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">ยืนยันรหัสผ่าน</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10" placeholder="••••••" />
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full gradient-primary text-primary-foreground shadow-glow" disabled={loading}>
              {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            มีบัญชีอยู่แล้ว?{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">เข้าสู่ระบบ</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Register;
