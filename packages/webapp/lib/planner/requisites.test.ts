import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateProhibition, evaluateRequisiteTree } from "./requisites.ts";
import type { RequisiteRule } from "./types.ts";

/** `(A OR B) AND (C OR D)` — the FIT2004 shape. */
const fit2004Shape: RequisiteRule = [
  {
    title: "Container 1",
    parent_connector: { value: "AND" },
    containers: [
      {
        title: "Container 1.2",
        parent_connector: { value: "OR" },
        relationships: [
          { academic_item_code: "FIT1008" },
          { academic_item_code: "FIT2085" },
          { academic_item_code: "FIT1054" },
        ],
      },
      {
        title: "Container 1.6",
        parent_connector: { value: "OR" },
        relationships: [
          { academic_item_code: "FIT1058" },
          { academic_item_code: "MAT1830" },
        ],
      },
    ],
  },
];

/** Flat `A OR B OR C` — the FIT2100 shape. */
const fit2100Shape: RequisiteRule = [
  {
    title: "Container 1",
    parent_connector: { value: "OR" },
    relationships: [
      { academic_item_code: "FIT1047" },
      { academic_item_code: "ENG1013" },
      { academic_item_code: "ENG1003" },
    ],
  },
];

test("empty rule is satisfied", () => {
  const r = evaluateRequisiteTree([], new Set());
  assert.equal(r.satisfied, true);
  assert.deepEqual(r.missingCodes, []);
});

test("null rule is satisfied", () => {
  const r = evaluateRequisiteTree(null, new Set());
  assert.equal(r.satisfied, true);
});

test("FIT2004 shape: need one from each OR group", () => {
  // Has FIT1008 but nothing from second group
  let r = evaluateRequisiteTree(fit2004Shape, new Set(["FIT1008"]));
  assert.equal(r.satisfied, false);
  assert.deepEqual(r.missingCodes, ["FIT1058", "FIT2085", "FIT1054", "MAT1830"].sort());

  // One from each group
  r = evaluateRequisiteTree(fit2004Shape, new Set(["FIT1008", "MAT1830"]));
  assert.equal(r.satisfied, true);
  assert.deepEqual(r.missingCodes, []);

  // Alternative from group 1
  r = evaluateRequisiteTree(fit2004Shape, new Set(["FIT1054", "FIT1058"]));
  assert.equal(r.satisfied, true);
});

test("FIT2004 shape: referencedCodes lists all leaves sorted", () => {
  const r = evaluateRequisiteTree(fit2004Shape, new Set());
  assert.deepEqual(r.referencedCodes, [
    "FIT1008",
    "FIT1054",
    "FIT1058",
    "FIT2085",
    "MAT1830",
  ]);
});

test("FIT2100 shape: OR flat list needs only one", () => {
  let r = evaluateRequisiteTree(fit2100Shape, new Set(["FIT1047"]));
  assert.equal(r.satisfied, true);

  r = evaluateRequisiteTree(fit2100Shape, new Set(["ENG1003"]));
  assert.equal(r.satisfied, true);

  r = evaluateRequisiteTree(fit2100Shape, new Set());
  assert.equal(r.satisfied, false);
  assert.deepEqual(r.missingCodes, ["ENG1003", "ENG1013", "FIT1047"]);
});

test("missing connector defaults to AND", () => {
  const rule: RequisiteRule = [
    {
      title: "Container 1",
      relationships: [
        { academic_item_code: "FIT1008" },
        { academic_item_code: "MAT1830" },
      ],
    },
  ];
  // AND default → need both
  assert.equal(evaluateRequisiteTree(rule, new Set(["FIT1008"])).satisfied, false);
  assert.equal(
    evaluateRequisiteTree(rule, new Set(["FIT1008", "MAT1830"])).satisfied,
    true,
  );
});

test("empty container (no children) is satisfied", () => {
  const rule: RequisiteRule = [
    { title: "Container 1", parent_connector: { value: "AND" } },
  ];
  assert.equal(evaluateRequisiteTree(rule, new Set()).satisfied, true);
});

test("nested containers combine: (A AND B) OR C", () => {
  const rule: RequisiteRule = [
    {
      parent_connector: { value: "OR" },
      containers: [
        {
          parent_connector: { value: "AND" },
          relationships: [
            { academic_item_code: "A" },
            { academic_item_code: "B" },
          ],
        },
      ],
      relationships: [{ academic_item_code: "C" }],
    },
  ];

  assert.equal(evaluateRequisiteTree(rule, new Set(["C"])).satisfied, true);
  assert.equal(evaluateRequisiteTree(rule, new Set(["A", "B"])).satisfied, true);
  assert.equal(evaluateRequisiteTree(rule, new Set(["A"])).satisfied, false);
});

test("multiple top-level containers combine with AND", () => {
  const rule: RequisiteRule = [
    {
      parent_connector: { value: "OR" },
      relationships: [{ academic_item_code: "A" }, { academic_item_code: "B" }],
    },
    {
      parent_connector: { value: "OR" },
      relationships: [{ academic_item_code: "C" }, { academic_item_code: "D" }],
    },
  ];
  assert.equal(evaluateRequisiteTree(rule, new Set(["A"])).satisfied, false);
  assert.equal(evaluateRequisiteTree(rule, new Set(["A", "C"])).satisfied, true);
});

test("prohibition: satisfied when none of the referenced codes are taken", () => {
  const rule: RequisiteRule = [
    {
      parent_connector: { value: "OR" },
      relationships: [
        { academic_item_code: "FIT1045" },
        { academic_item_code: "FIT1053" },
      ],
    },
  ];

  assert.deepEqual(evaluateProhibition(rule, new Set()), {
    satisfied: true,
    conflictingCodes: [],
  });
  assert.deepEqual(evaluateProhibition(rule, new Set(["FIT9999"])), {
    satisfied: true,
    conflictingCodes: [],
  });
  assert.deepEqual(evaluateProhibition(rule, new Set(["FIT1045"])), {
    satisfied: false,
    conflictingCodes: ["FIT1045"],
  });
  assert.deepEqual(
    evaluateProhibition(rule, new Set(["FIT1045", "FIT1053"])),
    { satisfied: false, conflictingCodes: ["FIT1045", "FIT1053"] },
  );
});

test("prohibition: null rule is always satisfied", () => {
  assert.deepEqual(evaluateProhibition(null, new Set(["FIT1045"])), {
    satisfied: true,
    conflictingCodes: [],
  });
});
