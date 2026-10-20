"use client";

import React, { useState, useEffect } from "react";
import { AnnouncementItem } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import { Megaphone, Plus, Bell, Calendar, Pin } from "lucide-react";

export default function AnnouncementsPage() {
  const { currentUser } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState<AnnouncementItem["targetAudience"]>("All");
  const [priority, setPriority] = useState<"High" | "Normal">("Normal");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canPublish = ["admin", "hr"].includes(currentUser.role);

  const loadData = async () => {
    try {
      const res = await fetch("/api/announcements");
      const data = await res.json();
      if (data.success) {
        setAnnouncements(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          targetAudience,
          priority,
          actor: { name: currentUser.name, role: currentUser.role },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setTitle("");
        setDescription("");
        loadData();
      }
    } catch (e) {
      console.error(e);
      alert("Error posting announcement");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Megaphone className="w-6 h-6 text-blue-600" />
            Company Announcements & Notices
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Broadcast official HR bulletins, holiday schedules, payroll deadlines, and policy updates.
          </p>
        </div>
        {canPublish && (
          <Button
            onClick={() => setIsModalOpen(true)}
            size="sm"
            icon={<Plus className="w-4 h-4" />}
          >
            Publish Notice
          </Button>
        )}
      </div>

      {/* Announcements Feed */}
      <div className="space-y-4">
        {announcements.map((ann) => (
          <div
            key={ann.id}
            className={`glass-card rounded-2xl p-6 border transition-all ${
              ann.priority === "High"
                ? "border-amber-500/30 bg-gradient-to-r from-amber-500/5 via-slate-900 to-slate-900"
                : "border-slate-800"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {ann.priority === "High" && (
                    <Badge variant="warning" className="flex items-center gap-1">
                      <Pin className="w-3 h-3 inline" /> Priority Alert
                    </Badge>
                  )}
                  <Badge variant="indigo">Audience: {ann.targetAudience}</Badge>
                  <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                    <Calendar className="w-3.5 h-3.5" /> Published on {ann.publishDate}
                  </span>
                </div>
                <h3 className="font-bold text-white text-base tracking-tight">{ann.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">{ann.description}</p>
                <div className="pt-2 text-[11px] text-slate-500">
                  Broadcast by <span className="text-slate-300 font-medium">{ann.publishedBy}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Publish Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Publish Official Announcement"
        subtitle="Broadcast updates to company noticeboards and employee notification feeds."
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Notice Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Annual Company Offsite 2026 Announcement"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Target Audience *
              </label>
              <select
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="All">All Company Employees</option>
                <option value="Engineering">Engineering Team Only</option>
                <option value="Sales">Sales Team Only</option>
                <option value="Product Design">Design Team Only</option>
                <option value="HR">HR & Admin Team</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Priority Level</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Normal">Normal Notice</option>
                <option value="High">High Priority / Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Announcement Body *
            </label>
            <textarea
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Full announcement description with details and dates..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmitting}>
              Broadcast Notice
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
