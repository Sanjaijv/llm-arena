const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const projectId = process.env.POSTHOG_PROJECT_ID;
const apiHost = process.env.POSTHOG_API_HOST;

if (!personalApiKey || !projectId || !apiHost) {
  throw new Error(
    "Missing POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID, or POSTHOG_API_HOST.",
  );
}

const projectApi = `${apiHost}/api/projects/${encodeURIComponent(projectId)}`;
const log = (message) => process.stdout.write(`${message}\n`);

const request = async (path, options = {}) => {
  const response = await fetch(`${projectApi}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${personalApiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`PostHog ${response.status} for ${path}: ${detail}`);
  }

  return response.json();
};

const event = (name, options = {}) => ({
  kind: "EventsNode",
  event: name,
  name,
  math: options.math ?? "total",
  ...(options.mathProperty ? { math_property: options.mathProperty } : {}),
  ...(options.properties ? { properties: options.properties } : {}),
});

const dateRange = { date_from: "-30d", explicitDate: false };
const trendsFilter = {
  display: "ActionsLineGraph",
  showLegend: true,
  yAxisScaleType: "linear",
  showValuesOnSeries: false,
  smoothingIntervals: 1,
  showPercentStackView: false,
  aggregationAxisFormat: "numeric",
  showAlertThresholdLines: false,
};

const trend = (series, breakdown) => ({
  kind: "InsightVizNode",
  source: {
    kind: "TrendsQuery",
    series,
    version: 4,
    interval: "day",
    dateRange,
    properties: [],
    trendsFilter,
    breakdownFilter: breakdown
      ? { breakdown, breakdown_type: "event" }
      : { breakdown_type: "event" },
    filterTestAccounts: false,
  },
});

const insights = [
  {
    name: "Arena · Core value funnel",
    description:
      "Committed prompt to settled, vote-eligible comparison to winner selection.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "FunnelsQuery",
        version: 2,
        series: [
          event("prompt_sent"),
          event("comparison_finished", {
            properties: [
              {
                key: "vote_eligible",
                type: "event",
                value: ["true"],
                operator: "exact",
              },
            ],
          }),
          event("vote_cast"),
        ],
        interval: "day",
        dateRange,
        properties: [],
        funnelsFilter: {
          layout: "horizontal",
          exclusions: [],
          funnelVizType: "steps",
          funnelOrderType: "ordered",
          funnelStepReference: "total",
          funnelWindowInterval: 24,
          funnelWindowIntervalUnit: "hour",
          breakdownAttributionType: "first_touch",
        },
        breakdownFilter: { breakdown_type: "event" },
        filterTestAccounts: false,
      },
    },
  },
  {
    name: "Arena · Comparison outcomes",
    description: "Settled comparisons broken down by final status.",
    query: trend([event("comparison_finished")], "status"),
  },
  {
    name: "Arena · Model errors",
    description: "Failed AI generations broken down by requested model.",
    query: trend(
      [
        event("$ai_generation", {
          properties: [
            {
              key: "$ai_is_error",
              type: "event",
              value: ["true"],
              operator: "exact",
            },
          ],
        }),
      ],
      "$ai_requested_model",
    ),
  },
  {
    name: "Arena · Model latency p95",
    description: "95th percentile generation latency by resolved model.",
    query: trend(
      [event("$ai_generation", { math: "p95", mathProperty: "$ai_latency" })],
      "$ai_model",
    ),
  },
  {
    name: "Arena · Winner selections",
    description:
      "Winner selections by model; compare with answer participation before treating this as win rate.",
    query: trend([event("vote_cast")], "selected_model"),
  },
  {
    name: "Arena · Sharing activity",
    description:
      "Share-link copies and public thread views. Thread-level conversion requires joining on thread_id.",
    query: trend([event("thread_shared"), event("public_thread_viewed")]),
  },
  {
    name: "Arena · Weekly prompt retention",
    description: "Weekly retention based on returning prompt senders.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "RetentionQuery",
        version: 2,
        dateRange: { date_from: "-90d", explicitDate: false },
        properties: [],
        retentionFilter: {
          period: "Week",
          targetEntity: { id: "prompt_sent", type: "events" },
          returningEntity: { id: "prompt_sent", type: "events" },
          retentionType: "retention_first_time",
          totalIntervals: 11,
        },
        filterTestAccounts: false,
      },
    },
  },
  {
    name: "Arena · Core Web Vitals p75",
    description: "75th percentile LCP, INP, and CLS reported by PostHog.",
    query: trend([
      event("$web_vitals", {
        math: "p75",
        mathProperty: "$web_vitals_LCP_value",
      }),
      event("$web_vitals", {
        math: "p75",
        mathProperty: "$web_vitals_INP_value",
      }),
      event("$web_vitals", {
        math: "p75",
        mathProperty: "$web_vitals_CLS_value",
      }),
    ]),
  },
];

const dashboardName = "Arena product health";
const dashboards = await request("/dashboards/?limit=100");
let dashboard = dashboards.results.find(({ name }) => name === dashboardName);

if (!dashboard) {
  dashboard = await request("/dashboards/", {
    method: "POST",
    body: JSON.stringify({
      name: dashboardName,
      description:
        "The prompt → comparison → vote loop, model reliability, sharing, retention, and frontend performance.",
      pinned: true,
      tags: ["llm-arena"],
    }),
  });
  log(`Created dashboard ${dashboard.id}: ${dashboard.name}`);
} else {
  log(`Using dashboard ${dashboard.id}: ${dashboard.name}`);
}

const existingInsights = await request("/insights/?limit=100");
const existingByName = new Map(
  existingInsights.results.map((insight) => [insight.name, insight]),
);

for (const definition of insights) {
  const existing = existingByName.get(definition.name);
  if (existing) {
    log(`Using insight ${existing.id}: ${existing.name}`);
    continue;
  }

  const created = await request("/insights/", {
    method: "POST",
    body: JSON.stringify({
      ...definition,
      dashboards: [dashboard.id],
      tags: ["llm-arena"],
    }),
  });
  log(`Created insight ${created.id}: ${created.name}`);
}

for (const definition of insights) {
  await request("/query/", {
    method: "POST",
    body: JSON.stringify({ query: definition.query.source }),
  });
  log(`Validated query: ${definition.name}`);
}

log(
  `PostHog setup complete: ${apiHost}/project/${projectId}/dashboard/${dashboard.id}`,
);
