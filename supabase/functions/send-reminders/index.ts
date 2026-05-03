import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const today = new Date();

  // Traer cursos pendientes
  const { data: enrollments, error } = await supabase
    .from("enrollments")
    .select(`
      id,
      due_date,
      user_id,
      profiles ( email, full_name ),
      courses ( title )
    `)
    .eq("status", "pending");

  if (error) {
    console.error("Error al obtener enrollments:", error);
    return new Response("Error", { status: 500 });
  }

  for (const e of enrollments || []) {
    if (!e.due_date) continue;

    const due = new Date(e.due_date);
    const diffDays = Math.ceil(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    let type = "";

    // ⏰ Recordatorio 3 días antes
    if (diffDays === 3) {
      type = "reminder_3_days";
    }

    // 🚨 Ya vencido
    if (diffDays < 0) {
      type = "overdue";
    }

    if (!type) continue;

    // Evitar duplicados
    const { data: existing } = await supabase
      .from("notifications_log")
      .select("id")
      .eq("enrollment_id", e.id)
      .eq("type", type)
      .maybeSingle();

    if (existing) continue;

    // 👉 Simulación de envío (por ahora)
    console.log(
      `📧 Email a ${e.profiles?.email} | Curso: ${e.courses?.title} | Tipo: ${type}`
    );

    // Guardar log
    await supabase.from("notifications_log").insert({
      enrollment_id: e.id,
      type,
    });
  }

  return new Response("OK");
});