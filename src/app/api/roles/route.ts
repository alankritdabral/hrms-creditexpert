import { NextRequest, NextResponse } from "next/server";
import {
  getCustomRoles,
  saveCustomRole,
  deleteCustomRole,
  getAllUserAccounts,
  assignUserRole,
} from "@/lib/db/db-adapter";
import { authenticateRequest, authFailureResponse, requirePermission } from "@/lib/api-auth";
import { APP_SECTIONS } from "@/lib/types";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  try {
    const roles = await getCustomRoles().catch((err) => {
      console.warn("getCustomRoles fallback warning:", err);
      return [];
    });
    const users = await getAllUserAccounts().catch((err) => {
      console.warn("getAllUserAccounts fallback warning:", err);
      return [];
    });

    // Map user accounts with clean display properties
    const safeRoles = Array.isArray(roles) ? roles : [];
    const safeUsers = Array.isArray(users) ? users : [];

    const userSummaries = safeUsers.map((u) => {
      const uRole = (u?.role || "employee").toString().toLowerCase().trim();
      const assignedRole = safeRoles.find(
        (r) => r?.id && r.id.toString().toLowerCase().trim() === uRole
      );
      return {
        id: u?.uid || `usr-${u?.employeeId || Math.random().toString(36).slice(2)}`,
        employeeId: u?.employeeId || "N/A",
        name: u?.name || "Employee",
        email: u?.email || "",
        role: u?.role || "employee",
        roleName: assignedRole?.name || (u?.role ? String(u.role).charAt(0).toUpperCase() + String(u.role).slice(1) : "Employee"),
        roleColor: assignedRole?.color || "purple",
        branch: u?.branch || "Delhi",
        department: u?.department || "General Operations",
        avatar: u?.avatar || "",
        status: u?.status || "Active",
        allowedSectionsCount: assignedRole?.sections && Array.isArray(assignedRole.sections)
          ? assignedRole.sections.length
          : (uRole === "admin" ? APP_SECTIONS.length : 10),
      };
    });

    return NextResponse.json({
      success: true,
      roles: safeRoles,
      sections: APP_SECTIONS,
      users: userSummaries,
    });
  } catch (error: any) {
    console.error("GET /api/roles error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load roles" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  // Only Admin or HR can modify roles and assign roles
  const permError = requirePermission(auth, "settings:manage");
  if (permError) return permError;

  try {
    const body = await req.json();

    // 1. Assign role to user action
    if (body.action === "assign_role") {
      const { identifier, role } = body;
      if (!identifier || !role) {
        return NextResponse.json(
          { success: false, error: "identifier and role are required for assignment" },
          { status: 400 }
        );
      }

      const updatedUser = await assignUserRole(identifier, role, {
        name: auth.actor?.name || auth.session?.name || "System",
        role: auth.role,
      });

      return NextResponse.json({
        success: true,
        message: `Successfully assigned role ${role} to ${updatedUser.name}`,
        user: updatedUser,
      });
    }

    // 2. Create or Update Custom Role
    const { name, sections, id, description, color } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Role name is required" },
        { status: 400 }
      );
    }
    if (!Array.isArray(sections)) {
      return NextResponse.json(
        { success: false, error: "sections must be an array of section IDs" },
        { status: 400 }
      );
    }

    const saved = await saveCustomRole(
      {
        id,
        name: name.trim(),
        description,
        color,
        sections,
      },
      {
        name: auth.actor?.name || auth.session?.name || "System",
        role: auth.role,
      }
    );

    return NextResponse.json({
      success: true,
      message: `Role "${saved.name}" saved with ${saved.sections.length} sections`,
      role: saved,
    });
  } catch (error: any) {
    console.error("POST /api/roles error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process role request" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.authenticated) {
    return authFailureResponse(auth);
  }

  const permError = requirePermission(auth, "settings:manage");
  if (permError) return permError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Role ID is required for deletion" },
        { status: 400 }
      );
    }

    await deleteCustomRole(id, {
      name: auth.actor?.name || auth.session?.name || "System",
      role: auth.role,
    });

    return NextResponse.json({
      success: true,
      message: "Custom role successfully deleted. Active users reassigned to Employee.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete role" },
      { status: 400 }
    );
  }
}
