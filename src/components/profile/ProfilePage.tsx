"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Camera, Check } from "lucide-react";
import { api } from "../../../convex/_generated/api";

interface FormState {
  displayName: string;
  role: string;
  company: string;
  location: string;
  timezone: string;
  communicationStyle: string;
  signOff: string;
  notes: string;
}

const EMPTY: FormState = {
  displayName: "",
  role: "",
  company: "",
  location: "",
  timezone: "",
  communicationStyle: "balanced",
  signOff: "",
  notes: "",
};

export function ProfilePage() {
  const profile = useQuery(api.profiles.get);
  const update = useMutation(api.profiles.update);
  const generateUploadUrl = useMutation(api.profiles.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.profiles.setAvatar);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

  // Hydrate the form once the profile loads.
  useEffect(() => {
    if (profile === undefined || hydrated.current) return;
    hydrated.current = true;
    setForm({
      displayName: profile?.displayName ?? "",
      role: profile?.role ?? "",
      company: profile?.company ?? "",
      location: profile?.location ?? "",
      timezone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      communicationStyle: profile?.communicationStyle ?? "balanced",
      signOff: profile?.signOff ?? "",
      notes: profile?.notes ?? "",
    });
  }, [profile]);

  const set = (key: keyof FormState) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await update({
        displayName: form.displayName || undefined,
        role: form.role || undefined,
        company: form.company || undefined,
        location: form.location || undefined,
        timezone: form.timezone || undefined,
        communicationStyle: form.communicationStyle || undefined,
        signOff: form.signOff || undefined,
        notes: form.notes || undefined,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();
      await setAvatar({ storageId });
    } finally {
      setUploading(false);
    }
  };

  const initial = (form.displayName || "O")[0]?.toUpperCase();

  return (
    <div className="relative z-10 flex h-screen w-screen flex-col overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 xl:px-7">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[15px] font-semibold tracking-[0.42em] text-white/90">
            J A R V I S
          </h1>
          <span className="label-xs">Operator Profile</span>
        </div>
        <Link
          href="/"
          className="mono flex items-center gap-1.5 rounded border border-white/10 px-2.5 py-1.5 text-[10px] tracking-[0.2em] text-white/40 uppercase transition hover:border-cyan-300/40 hover:text-cyan-200"
        >
          <ArrowLeft className="h-3 w-3" />
          Control Center
        </Link>
      </header>

      <div className="scroll-thin flex min-h-0 flex-1 justify-center overflow-y-auto px-4 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full max-w-[640px]"
        >
          <div className="glass rounded-2xl p-7">
            {/* Avatar */}
            <div className="mb-7 flex items-center gap-5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/[0.04] transition hover:border-cyan-300/50"
                title="Upload profile picture"
              >
                {profile?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatarUrl}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-cyan-200/70">
                    {initial}
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100">
                  {uploading ? (
                    <span className="mono shimmer-text text-[9px] uppercase">…</span>
                  ) : (
                    <Camera className="h-5 w-5 text-white/80" />
                  )}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAvatar(file);
                  e.target.value = "";
                }}
              />
              <div>
                <p className="text-[15px] font-medium text-white/85">
                  {form.displayName || "Unnamed operator"}
                </p>
                <p className="mt-0.5 text-[11.5px] text-white/35">
                  These details are shared with Bubloo — it will address you properly, adapt its
                  tone, and sign your emails.
                </p>
              </div>
            </div>

            <form onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Name"
                  value={form.displayName}
                  onChange={set("displayName")}
                  placeholder="Tony Stark"
                />
                <Field
                  label="Role"
                  value={form.role}
                  onChange={set("role")}
                  placeholder="Founder / Engineer / …"
                />
                <Field
                  label="Company"
                  value={form.company}
                  onChange={set("company")}
                  placeholder="Stark Industries"
                />
                <Field
                  label="Location"
                  value={form.location}
                  onChange={set("location")}
                  placeholder="Malibu, CA"
                />
                <Field
                  label="Timezone"
                  value={form.timezone}
                  onChange={set("timezone")}
                  placeholder="Asia/Kolkata"
                />
                <div>
                  <label className="label-xs mb-1.5 block">Communication style</label>
                  <select
                    value={form.communicationStyle}
                    onChange={(e) => set("communicationStyle")(e.target.value)}
                    className="mono w-full appearance-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white/85 outline-none transition focus:border-cyan-300/40 [&>option]:bg-[#0a0f18]"
                  >
                    <option value="concise">Concise — short and direct</option>
                    <option value="balanced">Balanced — natural detail</option>
                    <option value="detailed">Detailed — thorough briefings</option>
                  </select>
                </div>
              </div>

              <Field
                label="Email sign-off"
                value={form.signOff}
                onChange={set("signOff")}
                placeholder="Best regards, Tony"
              />

              <div>
                <label className="label-xs mb-1.5 block">
                  Anything else Bubloo should know
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes")(e.target.value)}
                  rows={4}
                  placeholder="Current projects, people I work with, preferences, things to keep in mind…"
                  className="mono w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] leading-relaxed text-white/85 outline-none transition focus:border-cyan-300/40"
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="mono rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-6 py-2.5 text-[12px] tracking-[0.25em] text-cyan-100 uppercase transition hover:bg-cyan-400/20 disabled:opacity-50"
                >
                  {saving ? <span className="shimmer-text">Saving…</span> : "Save profile"}
                </button>
                {saved && (
                  <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="mono flex items-center gap-1.5 text-[11px] text-emerald-300/80"
                  >
                    <Check className="h-3.5 w-3.5" /> Synced to Bubloo
                  </motion.span>
                )}
              </div>
            </form>
          </div>

          <p className="mt-4 px-1 text-center text-[11px] text-white/25">
            Restart the voice session after saving so Bubloo picks up the changes.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label-xs mb-1.5 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mono w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white/85 outline-none transition placeholder:text-white/20 focus:border-cyan-300/40 focus:bg-cyan-400/[0.04]"
      />
    </div>
  );
}
