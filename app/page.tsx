"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PieChart, Pie, Cell, Tooltip } from "recharts";

export default function Home() {
  const [userRole, setUserRole] = useState("");
  const [companyId, setCompanyId] = useState("");

  const [usersStats, setUsersStats] = useState<any[]>([]);
  const [sectorStats, setSectorStats] = useState<any[]>([]);
  const [assignedCourses, setAssignedCourses] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  const [matrixUsers, setMatrixUsers] = useState<any[]>([]);
  const [matrixCourses, setMatrixCourses] = useState<any[]>([]);

  const [users, setUsers] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);

  const [selectedUser, setSelectedUser] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedPackage, setSelectedPackage] = useState("");
  const [selectedSector, setSelectedSector] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");

  const [email, setEmail] = useState("");

  const [completed, setCompleted] = useState(0);
  const [pending, setPending] = useState(0);
  const [overdue, setOverdue] = useState(0);

  useEffect(() => {
    loadData();
  }, [sectorFilter]);

  const globalCompliance =
    completed + pending + overdue > 0
      ? Math.round((completed / (completed + pending + overdue)) * 100)
      : 0;

  const getDueDate = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleInvite = async () => {
    if (!email) return;

    await supabase.from("invitations").insert({
      email,
      company_id: companyId,
      role: "user",
    });

    alert("Invitación enviada");
    setEmail("");
  };

  const assignCourse = async () => {
    if (!selectedUser || !selectedCourse) return;

    const { data: course } = await supabase
      .from("courses")
      .select("duration_days")
      .eq("id", selectedCourse)
      .single();

    const duration = course?.duration_days || 30;

    await supabase.from("enrollments").insert({
      user_id: selectedUser,
      course_id: selectedCourse,
      status: "pending",
      company_id: companyId,
      due_date: getDueDate(duration),
    });

    alert("Curso asignado con vencimiento");
    loadData();
  };

  const assignPackage = async () => {
    if (!selectedUser || !selectedPackage) return;

    const { data: packageCourses } = await supabase
      .from("package_courses")
      .select(`
        course_id,
        courses ( duration_days )
      `)
      .eq("package_id", selectedPackage);

    if (!packageCourses) return;

    const inserts = packageCourses.map((pc: any) => {
      const duration = pc.courses?.duration_days || 30;

      return {
        user_id: selectedUser,
        course_id: pc.course_id,
        status: "pending",
        company_id: companyId,
        due_date: getDueDate(duration),
      };
    });

    await supabase.from("enrollments").insert(inserts);

    alert("Paquete asignado con vencimientos");
    loadData();
  };

  const assignToSector = async () => {
    if (!selectedSector || !selectedCourse) return;

    const { data: usersSector } = await supabase
      .from("profiles")
      .select("id")
      .eq("sector_id", selectedSector)
      .eq("company_id", companyId);

    const { data: course } = await supabase
      .from("courses")
      .select("duration_days")
      .eq("id", selectedCourse)
      .single();

    const duration = course?.duration_days || 30;

    const inserts = (usersSector || []).map((u: any) => ({
      user_id: u.id,
      course_id: selectedCourse,
      status: "pending",
      company_id: companyId,
      due_date: getDueDate(duration),
    }));

    await supabase.from("enrollments").insert(inserts);

    alert("Sector asignado con vencimientos");
    loadData();
  };

  const downloadCSV = (filename: string, rows: any[]) => {
    if (!rows.length) {
      alert("No hay datos para exportar");
      return;
    }

    const headers = Object.keys(rows[0]);

    const csvContent = [
      headers.join(";"),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`)
          .join(";")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  };

  const exportUsers = () => {
    const rows = usersStats.map((u: any) => ({
      Usuario: u.name,
      Total: u.total,
      Compliance: `${u.compliance}%`,
      Pendientes: u.pending,
      Vencidos: u.overdue,
    }));

    downloadCSV("usuarios.csv", rows);
  };

  const exportSectors = () => {
    const rows = sectorStats.map((s: any) => ({
      Sector: s.name,
      Total: s.total,
      Compliance: `${s.compliance}%`,
      Pendientes: s.pending,
      Vencidos: s.overdue,
    }));

    downloadCSV("sectores.csv", rows);
  };

  const exportAlerts = () => {
    const rows = alerts.map((a: any) => ({
      Tipo: a.type === "overdue" ? "Vencido" : "Por vencer",
      Usuario: a.user,
      Curso: a.course,
      Fecha: new Date(a.date).toLocaleDateString(),
    }));

    downloadCSV("alertas.csv", rows);
  };

  const loadData = async () => {
    const { data: session } = await supabase.auth.getSession();
    const user = session.session?.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .single();

    if (!profile) return;

    setUserRole(profile.role);
    setCompanyId(profile.company_id);

    const today = new Date();

    if (profile.role === "admin") {
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select(`
          id,
          status,
          due_date,
          user_id,
          profiles ( full_name, sector_id ),
          courses ( id, title )
        `)
        .eq("company_id", profile.company_id);

      let c = 0;
      let p = 0;
      let o = 0;

      const stats: any = {};
      const sectorMap: any = {};
      const alertsTemp: any[] = [];
      const courseMap: any = {};
      const userMatrixMap: any = {};

      enrollments?.forEach((item: any) => {
        if (sectorFilter && item.profiles?.sector_id !== sectorFilter) {
          return;
        }

        const uid = item.user_id;
        const sectorId = item.profiles?.sector_id || "Sin sector";
        const courseId = item.courses?.id;
        const courseTitle = item.courses?.title;

        if (courseId) {
          courseMap[courseId] = {
            id: courseId,
            title: courseTitle,
          };
        }

        if (!userMatrixMap[uid]) {
          userMatrixMap[uid] = {
            id: uid,
            name: item.profiles?.full_name,
            courses: {},
          };
        }

        if (!stats[uid]) {
          stats[uid] = {
            name: item.profiles?.full_name,
            total: 0,
            completed: 0,
            pending: 0,
            overdue: 0,
          };
        }

        if (!sectorMap[sectorId]) {
          sectorMap[sectorId] = {
            total: 0,
            completed: 0,
            pending: 0,
            overdue: 0,
          };
        }

        stats[uid].total++;
        sectorMap[sectorId].total++;

        const due = item.due_date ? new Date(item.due_date) : null;
        let computedStatus = "pending";

        if (item.status === "completed") {
          computedStatus = "completed";
          c++;
          stats[uid].completed++;
          sectorMap[sectorId].completed++;
        } else if (due) {
          const diffDays = Math.ceil(
            (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (diffDays < 0) {
            computedStatus = "overdue";
            o++;
            stats[uid].overdue++;
            sectorMap[sectorId].overdue++;

            alertsTemp.push({
              type: "overdue",
              user: item.profiles?.full_name,
              course: item.courses?.title,
              date: due,
            });
          } else {
            computedStatus = "pending";
            p++;
            stats[uid].pending++;
            sectorMap[sectorId].pending++;

            if (diffDays <= 3) {
              alertsTemp.push({
                type: "warning",
                user: item.profiles?.full_name,
                course: item.courses?.title,
                date: due,
              });
            }
          }
        } else {
          computedStatus = "pending";
          p++;
          stats[uid].pending++;
          sectorMap[sectorId].pending++;
        }

        if (courseId) {
          userMatrixMap[uid].courses[courseId] = computedStatus;
        }
      });

      setCompleted(c);
      setPending(p);
      setOverdue(o);
      setAlerts(alertsTemp);

      setMatrixCourses(Object.values(courseMap));
      setMatrixUsers(
        Object.values(userMatrixMap).map((u: any) => {
          const stat = stats[u.id];
          return {
            ...u,
            compliance:
              stat?.total > 0
                ? Math.round((stat.completed / stat.total) * 100)
                : 0,
          };
        })
      );

      setUsersStats(
        Object.values(stats).map((u: any) => ({
          ...u,
          compliance:
            u.total > 0 ? Math.round((u.completed / u.total) * 100) : 0,
        }))
      );

      const { data: sectorsData } = await supabase
        .from("sectors")
        .select("id, name")
        .eq("company_id", profile.company_id);

      const sectorNameMap: any = {};
      (sectorsData || []).forEach((s: any) => {
        sectorNameMap[s.id] = s.name;
      });

      setSectorStats(
        Object.entries(sectorMap).map(([sectorId, s]: any) => ({
          sectorId,
          name: sectorNameMap[sectorId] || "Sin sector",
          total: s.total,
          completed: s.completed,
          pending: s.pending,
          overdue: s.overdue,
          compliance:
            s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
        }))
      );

      const { data: usersData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("company_id", profile.company_id);

      setUsers(usersData || []);

      const { data: coursesData } = await supabase
        .from("courses")
        .select("id, title");

      setCourses(coursesData || []);

      const { data: packagesData } = await supabase
        .from("course_packages")
        .select("id, name");

      setPackages(packagesData || []);
      setSectors(sectorsData || []);

      return;
    }

    const { data: enrollments } = await supabase
      .from("enrollments")
      .select(`
        id,
        status,
        due_date,
        courses ( title )
      `)
      .eq("user_id", user.id);

    setAssignedCourses(enrollments || []);
  };

  const pieData = [
    { name: "Completados", value: completed },
    { name: "Pendientes", value: pending },
    { name: "Vencidos", value: overdue },
  ];

  const COLORS = ["#10b981", "#f59e0b", "#f43f5e"];

  const statusCellClass = (status: string | undefined) => {
    if (status === "completed") return "bg-emerald-100 text-emerald-700";
    if (status === "overdue") return "bg-rose-100 text-rose-700";
    if (status === "pending") return "bg-amber-100 text-amber-700";
    return "bg-slate-100 text-slate-500";
  };

  const statusLabel = (status: string | undefined) => {
    if (status === "completed") return "Cumplida";
    if (status === "overdue") return "Vencida";
    if (status === "pending") return "Pendiente";
    return "No asignada";
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
              Develop Yourself
            </h1>
            <p className="text-slate-500 mt-1 font-medium">
              Industrial Learning Solutions
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="bg-slate-900 hover:bg-slate-800 transition-colors text-white px-5 py-2.5 rounded-lg shadow-sm font-medium"
          >
            Logout
          </button>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 mb-6">
          <p className="text-slate-500 font-medium text-sm">Cumplimiento general</p>

          <div className="flex items-center gap-4 mt-3">
            <h2 className="text-4xl font-bold text-slate-900 tracking-tight">
              {globalCompliance}%
            </h2>

            <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${globalCompliance}%` }}
              />
            </div>
          </div>
        </div>

        {userRole === "admin" && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/60 mb-6 flex items-center">
            <label className="mr-3 font-medium text-slate-700 text-sm">
              Filtrar por sector:
            </label>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="border border-slate-200 bg-slate-50 p-2 rounded-lg text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            >
              <option value="">Todos los sectores</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border border-emerald-100 p-6 rounded-2xl shadow-sm">
            <p className="text-emerald-600 font-medium text-sm">Completados</p>
            <h2 className="text-4xl font-bold text-slate-900 mt-2 tracking-tight">
              {completed}
            </h2>
          </div>

          <div className="bg-white border border-amber-100 p-6 rounded-2xl shadow-sm">
            <p className="text-amber-600 font-medium text-sm">Pendientes</p>
            <h2 className="text-4xl font-bold text-slate-900 mt-2 tracking-tight">
              {pending}
            </h2>
          </div>

          <div className="bg-white border border-rose-100 p-6 rounded-2xl shadow-sm">
            <p className="text-rose-600 font-medium text-sm">Vencidos</p>
            <h2 className="text-4xl font-bold text-slate-900 mt-2 tracking-tight">
              {overdue}
            </h2>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 mb-8 flex justify-center">
          <PieChart width={300} height={300}>
            <Pie data={pieData} dataKey="value" outerRadius={100}>
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </div>

        {userRole === "admin" && (
          <>
            <div className="mb-6 flex flex-wrap gap-3">
              <button
                onClick={exportUsers}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm font-medium text-sm transition-colors"
              >
                Exportar usuarios
              </button>

              <button
                onClick={exportSectors}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm font-medium text-sm transition-colors"
              >
                Exportar sectores
              </button>

              <button
                onClick={exportAlerts}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm font-medium text-sm transition-colors"
              >
                Exportar alertas
              </button>
            </div>

            {sectorStats.length > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 mb-8 overflow-hidden">
                <h2 className="font-semibold text-xl mb-4 text-slate-900">
                  Cumplimiento por sector
                </h2>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-xs font-semibold">
                      <tr>
                        <th className="py-3 px-4 rounded-tl-lg">Sector</th>
                        <th className="py-3 px-4">Total</th>
                        <th className="py-3 px-4">Compliance</th>
                        <th className="py-3 px-4">Pendientes</th>
                        <th className="py-3 px-4 rounded-tr-lg">Vencidos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sectorStats.map((s: any, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-4 font-medium text-slate-900">{s.name}</td>
                          <td className="py-4 px-4 text-slate-600">{s.total}</td>
                          <td className="py-4 px-4">
                            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                              <div
                                className="bg-emerald-500 text-white text-[10px] flex items-center justify-center font-bold h-full transition-all"
                                style={{ width: `${s.compliance}%` }}
                              >
                                {s.compliance > 15 ? `${s.compliance}%` : ''}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-amber-600 font-medium">{s.pending}</td>
                          <td className="py-4 px-4 text-rose-600 font-medium">
                            {s.overdue}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {alerts.length > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 mb-8">
                <h2 className="font-semibold text-xl mb-4 text-slate-900">
                  Alertas de vencimiento
                </h2>

                <div className="space-y-3">
                  {alerts.map((a, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-xl border flex items-center gap-4 ${
                        a.type === "overdue"
                          ? "bg-rose-50/50 border-rose-100 border-l-4 border-l-rose-500 text-rose-900"
                          : "bg-amber-50/50 border-amber-100 border-l-4 border-l-amber-500 text-amber-900"
                      }`}
                    >
                      <div className="text-2xl">
                        {a.type === "overdue" ? "🔴" : "🟡"}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">
                          {a.type === "overdue" ? "Vencido" : "Por vencer"}
                        </p>
                        <p className="text-sm mt-1">
                          <span className="font-medium">{a.user}</span> • {a.course}
                        </p>
                        <p className="text-xs mt-1 opacity-80">
                          Vence: {new Date(a.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col">
                <h2 className="font-semibold text-lg mb-4 text-slate-900">Invitar usuario</h2>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@email.com"
                  className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg w-full mb-4 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
                <button
                  onClick={handleInvite}
                  className="mt-auto bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-medium px-4 py-2.5 rounded-lg w-full shadow-sm"
                >
                  Invitar
                </button>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col">
                <h2 className="font-semibold text-lg mb-4 text-slate-900">Asignar curso</h2>
                <select
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg w-full mb-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">Seleccionar usuario...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>

                <select
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg w-full mb-4 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">Seleccionar curso...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>

                <button
                  onClick={assignCourse}
                  className="mt-auto bg-emerald-600 hover:bg-emerald-700 transition-colors text-white font-medium px-4 py-2.5 rounded-lg w-full shadow-sm"
                >
                  Asignar curso
                </button>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col">
                <h2 className="font-semibold text-lg mb-4 text-slate-900">Asignar paquete</h2>
                <select
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg w-full mb-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">Seleccionar usuario...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>

                <select
                  onChange={(e) => setSelectedPackage(e.target.value)}
                  className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg w-full mb-4 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">Seleccionar paquete...</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={assignPackage}
                  className="mt-auto bg-purple-600 hover:bg-purple-700 transition-colors text-white font-medium px-4 py-2.5 rounded-lg w-full shadow-sm"
                >
                  Asignar paquete
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 mb-8">
              <h2 className="font-semibold text-lg mb-4 text-slate-900">Asignar a sector completo</h2>

              <div className="grid md:grid-cols-3 gap-4">
                <select
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">Seleccionar sector...</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <select
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">Seleccionar curso...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>

                <button
                  onClick={assignToSector}
                  className="bg-orange-600 hover:bg-orange-700 transition-colors text-white font-medium px-4 py-2.5 rounded-lg shadow-sm"
                >
                  Asignar a sector
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
              <h2 className="font-semibold text-xl mb-4 text-slate-900">
                Matriz de capacitación
              </h2>

              <div className="flex flex-wrap gap-4 text-sm mb-6 text-slate-600">
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-400"></div> Cumplida</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-400"></div> Pendiente</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-rose-400"></div> Vencida</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-200"></div> No asignada</span>
              </div>

              <div className="overflow-x-auto pb-4 border border-slate-100 rounded-xl">
                <table className="w-full text-sm min-w-[900px] text-left border-collapse">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 sticky left-0 bg-slate-50 z-10 shadow-[1px_0_0_0_#e2e8f0]">Usuario</th>
                      <th className="py-3 px-4">Compliance</th>
                      {matrixCourses.map((course: any) => (
                        <th key={course.id} className="py-3 px-2 text-center w-24">
                          <span className="inline-block transform -rotate-45 origin-left whitespace-nowrap text-[10px] w-8 h-20 translate-x-3 translate-y-6">{course.title}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {matrixUsers.map((u: any) => (
                      <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-900 sticky left-0 bg-white shadow-[1px_0_0_0_#e2e8f0]">
                          {u.name}
                        </td>

                        <td className="py-3 px-4 min-w-[120px]">
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-slate-100 rounded-full h-2">
                              <div
                                className="bg-emerald-500 h-2 rounded-full"
                                style={{ width: `${u.compliance}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-semibold text-slate-600 w-8">{u.compliance}%</span>
                          </div>
                        </td>

                        {matrixCourses.map((course: any) => {
                          const status = u.courses[course.id];

                          return (
                            <td key={course.id} className="p-2 text-center">
                              <div
                                title={statusLabel(status)}
                                className={`mx-auto h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-transform hover:scale-110 cursor-help ${statusCellClass(
                                  status
                                )}`}
                              >
                                {status === "completed"
                                  ? "✓"
                                  : status === "overdue"
                                  ? "!"
                                  : status === "pending"
                                  ? "…"
                                  : "-"}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {userRole !== "admin" && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 text-slate-900">
            <h2 className="font-semibold text-xl mb-4">Mis cursos</h2>
            <div className="grid gap-3">
              {assignedCourses.map((c) => (
                <div key={c.id} className="border border-slate-100 bg-slate-50 p-4 rounded-xl flex justify-between items-center">
                  <span className="font-medium">{c.courses?.title}</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusCellClass(c.status)}`}>
                    {statusLabel(c.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}