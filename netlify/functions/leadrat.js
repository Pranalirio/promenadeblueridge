exports.handler = async function (event) {

  // Only POST requests are allowed
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        message: "Method not allowed"
      })
    };
  }

  try {

    const data = JSON.parse(event.body || "{}");

    const name = (data.name || "").trim();
    const mobile = (data.phone || data.mobile || "")
      .replace(/\D/g, "")
      .slice(-10);

    const configuration =
      data.configuration ||
      data.bhk ||
      "";

    // Basic validation
    if (!name || mobile.length !== 10) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "Valid name and 10-digit mobile number are required"
        })
      };
    }

    // Current Indian date/time
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

    console.log(
      "Sending LeadRat payload:",
      JSON.stringify(leadRatPayload)
    );

    // IMPORTANT:
    // LeadRat documentation shows the request body as a JSON object.
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

    console.log(
      "LeadRat response:",
      response.status,
      responseText
    );

    if (!response.ok) {
      return {
        statusCode: 502,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "LeadRat rejected the lead",
          leadRatStatus: response.status,
          details: responseText
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: true,
        message: "Lead successfully sent to LeadRat",
        leadRatResponse: responseText
      })
    };

  } catch (error) {

    console.error("Function error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        message: "Server error",
        error: error.message
      })
    };
  }
};
