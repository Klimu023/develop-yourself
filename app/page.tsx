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

  const COLORS = ["#22c55e", "#facc15", "#ef4444"];

  const statusCellClass = (status: string | undefined) => {
    if (status === "completed") return "bg-green-500 text-white";
    if (status === "overdue") return "bg-red-500 text-white";
    if (status === "pending") return "bg-yellow-400 text-black";
    return "bg-gray-200 text-black";
  };

  const statusLabel = (status: string | undefined) => {
    if (status === "completed") return "Cumplida";
    if (status === "overdue") return "Vencida";
    if (status === "pending") return "Pendiente";
    return "No asignada";
  };

  return (
    <main className="min-h-screen bg-gray-100 p-8 text-black">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-black">
              Develop Yourself
            </h1>
            <p className="text-black mt-1">
              Industrial Learning Solutions
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg"
          >
            Logout
          </button>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm mb-6">
          <p className="text-black font-medium">Cumplimiento general</p>

          <div className="flex items-center gap-4 mt-2">
            <h2 className="text-4xl font-bold text-black">
              {globalCompliance}%
            </h2>

            <div className="w-full bg-gray-200 rounded-lg h-4">
              <div
                className="bg-green-500 h-4 rounded-lg"
                style={{ width: `${globalCompliance}%` }}
              />
            </div>
          </div>
        </div>

        {userRole === "admin" && (
          <div className="bg-white p-5 rounded-2xl shadow-sm mb-6">
            <label className="mr-3 font-semibold text-black">
              Filtrar por sector:
            </label>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="border p-2 rounded-lg text-black"
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
          <div className="bg-green-100 p-6 rounded-2xl shadow-sm">
            <p className="text-black font-medium">Completados</p>
            <h2 className="text-3xl font-bold text-black">
              {completed}
            </h2>
          </div>

          <div className="bg-yellow-100 p-6 rounded-2xl shadow-sm">
            <p className="text-black font-medium">Pendientes</p>
            <h2 className="text-3xl font-bold text-black">
              {pending}
            </h2>
          </div>

          <div className="bg-red-100 p-6 rounded-2xl shadow-sm">
            <p className="text-black font-medium">Vencidos</p>
            <h2 className="text-3xl font-bold text-black">
              {overdue}
            </h2>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm mb-8 flex justify-center">
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
                className="border bg-white px-4 py-2 rounded-lg shadow-sm text-black"
              >
                Exportar usuarios
              </button>

              <button
                onClick={exportSectors}
                className="border bg-white px-4 py-2 rounded-lg shadow-sm text-black"
              >
                Exportar sectores
              </button>

              <button
                onClick={exportAlerts}
                className="border bg-white px-4 py-2 rounded-lg shadow-sm text-black"
              >
                Exportar alertas
              </button>
            </div>

            {sectorStats.length > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm mb-8">
                <h2 className="font-semibold text-xl mb-4 text-black">
                  Cumplimiento por sector
                </h2>

                <table className="w-full text-sm text-black">
                  <thead>
                    <tr className="border-b text-left text-black">
                      <th className="py-2">Sector</th>
                      <th>Total</th>
                      <th>Compliance</th>
                      <th>Pendientes</th>
                      <th>Vencidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectorStats.map((s: any, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-3 font-medium">{s.name}</td>
                        <td>{s.total}</td>
                        <td>
                          <div className="w-full bg-gray-200 rounded-lg">
                            <div
                              className="bg-green-500 text-white text-xs text-center rounded-lg"
                              style={{ width: `${s.compliance}%` }}
                            >
                              {s.compliance}%
                            </div>
                          </div>
                        </td>
                        <td>{s.pending}</td>
                        <td className="text-red-600 font-medium">
                          {s.overdue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {alerts.length > 0 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm mb-8">
                <h2 className="font-semibold text-xl mb-4 text-black">
                  Alertas de vencimiento
                </h2>

                {alerts.map((a, i) => (
                  <div
                    key={i}
                    className={`p-4 mb-3 rounded-xl border-l-4 ${
                      a.type === "overdue"
                        ? "bg-red-50 border-red-500 text-black"
                        : "bg-yellow-50 border-yellow-500 text-black"
                    }`}
                  >
                    <p className="font-semibold">
                      {a.type === "overdue" ? "🔴 Vencido" : "🟡 Por vencer"}
                    </p>
                    <p>👤 {a.user}</p>
                    <p>📚 {a.course}</p>
                    <p>📅 {new Date(a.date).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <h2 className="font-semibold mb-4 text-black">Invitar usuario</h2>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email"
                  className="border p-2 rounded-lg w-full mb-3 text-black"
                />
                <button
                  onClick={handleInvite}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg w-full"
                >
                  Invitar
                </button>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <h2 className="font-semibold mb-4 text-black">Asignar curso</h2>
                <select
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="border p-2 rounded-lg w-full mb-3 text-black"
                >
                  <option value="">Usuario</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>

                <select
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="border p-2 rounded-lg w-full mb-3 text-black"
                >
                  <option value="">Curso</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>

                <button
                  onClick={assignCourse}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg w-full"
                >
                  Asignar curso
                </button>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <h2 className="font-semibold mb-4 text-black">Asignar paquete</h2>
                <select
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="border p-2 rounded-lg w-full mb-3 text-black"
                >
                  <option value="">Usuario</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>

                <select
                  onChange={(e) => setSelectedPackage(e.target.value)}
                  className="border p-2 rounded-lg w-full mb-3 text-black"
                >
                  <option value="">Paquete</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={assignPackage}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg w-full"
                >
                  Asignar paquete
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm mb-8">
              <h2 className="font-semibold mb-4 text-black">Asignar a sector</h2>

              <div className="grid md:grid-cols-3 gap-4">
                <select
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className="border p-2 rounded-lg text-black"
                >
                  <option value="">Sector</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <select
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="border p-2 rounded-lg text-black"
                >
                  <option value="">Curso</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>

                <button
                  onClick={assignToSector}
                  className="bg-orange-600 text-white px-4 py-2 rounded-lg"
                >
                  Asignar a sector
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm">
              <h2 className="font-semibold text-xl mb-4 text-black">
                Matriz de capacitación
              </h2>

              <div className="flex flex-wrap gap-4 text-sm mb-4 text-black">
                <span>🟢 Cumplida</span>
                <span>🟡 Pendiente</span>
                <span>🔴 Vencida</span>
                <span>⚪ No asignada</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px] text-black">
                  <thead>
                    <tr className="border-b text-left text-black">
                      <th className="py-2 sticky left-0 bg-white">Usuario</th>
                      <th className="py-2">Compliance</th>
                      {matrixCourses.map((course: any) => (
                        <th key={course.id} className="py-2 px-2 text-center">
                          {course.title}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {matrixUsers.map((u: any) => (
                      <tr key={u.id} className="border-b">
                        <td className="py-3 font-medium sticky left-0 bg-white">
                          {u.name}
                        </td>

                        <td className="py-3 min-w-[160px]">
                          <div className="w-full bg-gray-200 rounded-lg">
                            <div
                              className="bg-green-500 text-white text-xs text-center rounded-lg"
                              style={{ width: `${u.compliance}%` }}
                            >
                              {u.compliance}%
                            </div>
                          </div>
                        </td>

                        {matrixCourses.map((course: any) => {
                          const status = u.courses[course.id];

                          return (
                            <td key={course.id} className="p-2 text-center">
                              <div
                                title={statusLabel(status)}
                                className={`mx-auto h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${statusCellClass(
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
          <div className="bg-white p-6 rounded-2xl shadow-sm text-black">
            <h2 className="font-semibold text-xl mb-4">Mis cursos</h2>
            {assignedCourses.map((c) => (
              <div key={c.id} className="border p-3 mb-2 rounded-lg">
                {c.courses?.title} - {c.status}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}