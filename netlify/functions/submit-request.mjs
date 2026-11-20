const allowedBranches = new Set(["Bloemfontein", "Welkom", "Bethlehem"]);
const allowedTypes = new Set([
  "Gazebo Day", "Corporate Presentation", "Community Event",
  "School Activation", "Sports Event", "Promotional Activation", "Other"
]);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function clean(value, max = 3000) {
  return String(value ?? "").trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const data = await request.json();
    if (clean(data.website, 200)) return json(200, { reference: "received" });

    const first_name = clean(data.first_name, 80);
    const surname = clean(data.surname, 80);
    const id_number = clean(data.id_number, 13);
    const adviser_email = clean(data.adviser_email, 254).toLowerCase();
    const branch = clean(data.branch, 40);
    const event_type = clean(data.event_type, 60);
    const event_date = clean(data.event_date, 10);
    const venue = clean(data.venue, 200);
    const expected_attendees = Number(data.expected_attendees);
    const requested_amount = Number(data.requested_amount);
    const funding_breakdown = clean(data.funding_breakdown, 3000);
    const additional_notes = clean(data.additional_notes, 3000);

    if (!first_name || !surname || !/^[0-9]{13}$/.test(id_number) ||
        !validEmail(adviser_email) || !allowedBranches.has(branch) ||
        !allowedTypes.has(event_type) || !/^\d{4}-\d{2}-\d{2}$/.test(event_date) ||
        !venue || !Number.isInteger(expected_attendees) || expected_attendees < 1 ||
        !Number.isFinite(requested_amount) || requested_amount <= 0 ||
        !funding_breakdown) {
      return json(400, { error: "Please check all required fields and try again." });
    }

    const date = new Date(`${event_date}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== event_date) {
      return json(400, { error: "Please enter a valid event date." });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      console.error("Missing Supabase server environment variables.");
      return json(503, { error: "The portal is not fully configured yet. Please try again later." });
    }

    const reference = `SXF-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const record = {
      first_name, surname, id_number, adviser_email, branch, event_type, event_date,
      venue, expected_attendees, requested_amount, funding_breakdown, additional_notes,
      request_reference: reference, status: "pending_approval"
    };

    const saved = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/funding_requests`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(record)
    });

    if (!saved.ok) {
      const detail = await saved.text();
      console.error("Supabase insert failed", saved.status, detail);
      return json(500, { error: "We could not save your application. Please try again later." });
    }

    return json(200, { reference });
  } catch (error) {
    console.error("Funding submission error", error);
    return json(500, { error: "Something went wrong while submitting your application. Please try again." });
  }
};
