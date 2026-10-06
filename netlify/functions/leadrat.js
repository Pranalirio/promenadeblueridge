exports.handler = async function (event) {

  // Allow requests only through POST
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
    const mobile = (data.phone || data.mobile || "").replace(/\D/g, "");
    const configuration = data.configuration || "";

    if (!name || !mobile) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "Name and mobile number are required"
        })
      };
    }

    const leadRatPayload = {
      name: name,

      countryCode: "91",
      mobile: mobile.slice(-10),

      state: "Maharashtra",
      city: "Pune",
      location: "Hinjewadi",

      project: "The Promenade Residences - Blue Ridge",

      property: "The Promenade Residences - Blue Ridge",

      propertyType: "Residential",

      source: data.utm_source || "Website",
      subSource: data.utm_medium || "Landing Page",

      CampaignName:
        data.utm_campaign || "Promenade Blue Ridge Website",

      notes:
        "Interested in: " + configuration,

      additionalProperties: {
        EnquiredFor: "The Promenade Residences - Blue Ridge",
        BHKType: configuration,
        NoOfBHK: configuration
      }
    };

    const response = await fetch(
      "https://connect.leadrat.com/api/v1/integration/Website",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "API-Key": process.env.LEADRAT_API_KEY
        },

        body: JSON.stringify(leadRatPayload)
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        "LeadRat Error:",
        response.status,
        responseText
      );

      return {
        statusCode: 502,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          success: false,
          message: "LeadRat rejected the lead",
          status: response.status,
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
        message: "Lead successfully sent to LeadRat"
      })
    };

  } catch (error) {

    console.error("Function Error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        message: "Server error"
      })
    };
  }
};
