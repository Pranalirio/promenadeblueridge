
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://promenadeblueridge.com",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const jsonResponse = (statusCode, data) => ({
  statusCode,
  headers: {
    ...corsHeaders,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(data)
});

exports.handler = async function (event) {

  // Handle browser CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ""
    };
  }

  // Only POST requests are allowed
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const data = JSON.parse(event.body || "{}");

    const name = String(data.name || "").trim();

    const mobile = String(data.phone || data.mobile || "")
      .replace(/\D/g, "")
      .slice(-10);

    const configuration =
      data.configuration ||
      data.bhk ||
      "";

    // Basic validation
    if (!name || mobile.length !== 10) {
      return jsonResponse(400, {
        success: false,
        message: "Valid name and 10-digit mobile number are required"
      });
    }

    // Indian date and time
    const now = new Date();

    const submittedDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit"
    })
      .format(now)
      .replace(/\//g, "-");

    const submittedTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(now);

    const leadRatPayload = {
      name: name,

      state: "Maharashtra",
      city: "Pune",
      location: "Hinjewadi",

      budget: "",

      notes: configuration
        ? "Interested in " + configuration
        : "Landing page enquiry",

      email: data.email || "",

      countryCode: "91",
      mobile: mobile,

      project: "The Promenade Residences - Blue Ridge",
      property: "The Promenade Residences - Blue Ridge",

      leadExpectedBudget: "",
      propertyType: "Flat",

      submittedDate: submittedDate,
      submittedTime: submittedTime,

      LeadId: "",

      subsource:
        data.utm_source ||
        data.subsource ||
        "Website Landing Page",

      leadStatus: "",
      callRecordingUrl: "",
      scheduledDate: "",

      additionalProperties: {
        EnquiredFor: "Buy",
        BHKType: configuration || "",
        NoOfBHK: configuration || ""
      }
    };

    // Never log customer personal information
    // or your LeadRat API key.

    if (!process.env.LEADRAT_API_KEY) {
      console.error("LEADRAT_API_KEY is missing");
      return jsonResponse(500, {
        success: false,
        message: "Lead service configuration error"
      });
    }

    // LeadRat expects an array of lead objects
    const response = await fetch(
      "https://connect.leadrat.com/api/v1/integration/Website",
      {
        method: "POST",
        headers: {
          "API-Key": process.env.LEADRAT_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify([leadRatPayload])
      }
    );

    const responseText = await response.text();

    console.log("LeadRat HTTP status:", response.status);

    if (!response.ok) {
      return jsonResponse(502, {
        success: false,
        message: "LeadRat rejected the lead",
        leadRatStatus: response.status
      });
    }

    return jsonResponse(200, {
      success: true,
      message: "Lead successfully sent to LeadRat"
    });

  } catch (error) {
    console.error("LeadRat function failed:", error.name);

    return jsonResponse(500, {
      success: false,
      message: "Server error while processing enquiry"
    });
  }
};

