(function bootPairwiseLab() {
  "use strict";

  const core = window.PairwiseCore;
  const sampleFactors = [
    "Browser=Chrome, Edge, Safari, Firefox",
    "OS=Windows, macOS, iOS, Android",
    "Login Type=Email, Google, Kakao",
    "Plan=Free, Pro, Enterprise",
    "Locale=ko-KR, en-US, ja-JP",
  ].join("\n");
  const sampleConstraints = [
    "OS=iOS && Browser=Edge",
    "OS=Android && Browser=Safari",
    "Plan=Free && Login Type=Kakao",
  ].join("\n");

  const els = {
    factorInput: document.querySelector("#factorInput"),
    constraintInput: document.querySelector("#constraintInput"),
    generateButton: document.querySelector("#generateButton"),
    resetButton: document.querySelector("#resetButton"),
    sampleButton: document.querySelector("#sampleButton"),
    csvButton: document.querySelector("#csvButton"),
    strengthLabel: document.querySelector("#strengthLabel"),
    tupleLabel: document.querySelector("#tupleLabel"),
    messageBlock: document.querySelector("#messageBlock"),
    statusChip: document.querySelector("#statusChip"),
    caseCount: document.querySelector("#caseCount"),
    pairCount: document.querySelector("#pairCount"),
    coverageCount: document.querySelector("#coverageCount"),
    tableWrap: document.querySelector("#tableWrap"),
  };

  let lastResult = {
    factors: [],
    tests: [],
    stats: null,
  };

  function setMessage(text, mode) {
    els.messageBlock.textContent = text;
    els.messageBlock.classList.toggle("is-error", mode === "error");
    els.messageBlock.classList.toggle("is-ok", mode === "ok");
    els.statusChip.textContent = mode === "error" ? "ERROR" : mode === "ok" ? "GENERATED" : "READY";
    els.statusChip.classList.toggle("is-error", mode === "error");
    els.statusChip.classList.toggle("is-ok", mode === "ok");
  }

  function updateStats(stats, count) {
    const strength = stats ? stats.strength : Number(getSelectedStrength());
    els.tupleLabel.textContent = strength === 3 ? "VALID TRIPLES" : "VALID PAIRS";
    els.caseCount.textContent = String(count || 0);
    els.pairCount.textContent = String(stats ? stats.totalTuples : 0);
    els.coverageCount.textContent = `${stats ? stats.coverage : 0}%`;
  }

  function renderEmpty() {
    els.tableWrap.innerHTML = '<div class="empty-state"><span>WAITING FOR INPUT</span></div>';
    els.csvButton.disabled = true;
    updateStats(null, 0);
  }

  function renderTable(factors, tests) {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    const headerRow = document.createElement("tr");
    const idHeader = document.createElement("th");

    idHeader.textContent = "Test Case";
    headerRow.append(idHeader);

    factors.forEach((factor) => {
      const th = document.createElement("th");
      th.textContent = factor.name;
      headerRow.append(th);
    });

    thead.append(headerRow);

    tests.forEach((testCase, index) => {
      const row = document.createElement("tr");
      const idCell = document.createElement("td");
      idCell.textContent = `TC-${String(index + 1).padStart(3, "0")}`;
      row.append(idCell);

      factors.forEach((factor) => {
        const cell = document.createElement("td");
        cell.textContent = testCase[factor.name];
        row.append(cell);
      });

      tbody.append(row);
    });

    table.append(thead, tbody);
    els.tableWrap.replaceChildren(table);
    els.csvButton.disabled = tests.length === 0;
  }

  function generate() {
    const strength = getSelectedStrength();
    const maxCases = getSelectedMaxCases();
    const parsedFactors = core.parseFactors(els.factorInput.value);
    if (parsedFactors.errors.length > 0) {
      lastResult = { factors: [], tests: [], stats: null };
      renderEmpty();
      setMessage(parsedFactors.errors.join(" / "), "error");
      return;
    }

    const parsedConstraints = core.parseConstraints(
      els.constraintInput.value,
      parsedFactors.factors,
    );

    if (parsedConstraints.errors.length > 0) {
      lastResult = { factors: [], tests: [], stats: null };
      renderEmpty();
      setMessage(parsedConstraints.errors.join(" / "), "error");
      return;
    }

    try {
      const result = core.generatePairwise(parsedFactors.factors, parsedConstraints.constraints, {
        strength,
        maxCases,
      });
      lastResult = {
        factors: parsedFactors.factors,
        tests: result.tests,
        stats: result.stats,
      };
      renderTable(parsedFactors.factors, result.tests);
      updateStats(result.stats, result.tests.length);
      els.strengthLabel.textContent = `${strength}-WISE`;
      setMessage(
        `${result.tests.length} CASES / ${result.stats.coveredTuples} OF ${result.stats.totalTuples} ${
          strength === 3 ? "TRIPLES" : "PAIRS"
        } / ${result.stats.coverage}%${result.stats.limited ? " / LIMITED" : ""}`,
        "ok",
      );
    } catch (error) {
      lastResult = { factors: [], tests: [], stats: null };
      renderEmpty();
      setMessage(error.message, "error");
    }
  }

  function exportCsv() {
    if (lastResult.tests.length === 0) {
      return;
    }

    const csv = core.toCsv(lastResult.tests, lastResult.factors);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `pairwise-lab-${stamp}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function getSelectedStrength() {
    const checked = document.querySelector('input[name="strength"]:checked');
    return checked ? Number(checked.value) : 2;
  }

  function getSelectedMaxCases() {
    const checked = document.querySelector('input[name="maxCases"]:checked');
    if (!checked || checked.value === "") {
      return null;
    }
    return Number(checked.value);
  }

  function updateStrengthLabel() {
    els.strengthLabel.textContent = `${getSelectedStrength()}-WISE`;
    updateStats(lastResult.stats, lastResult.tests.length);
  }

  function loadSample() {
    els.factorInput.value = sampleFactors;
    els.constraintInput.value = sampleConstraints;
    generate();
  }

  function reset() {
    els.factorInput.value = "";
    els.constraintInput.value = "";
    lastResult = { factors: [], tests: [], stats: null };
    renderEmpty();
    setMessage("NO RUN YET", "idle");
  }

  els.generateButton.addEventListener("click", generate);
  els.csvButton.addEventListener("click", exportCsv);
  els.sampleButton.addEventListener("click", loadSample);
  els.resetButton.addEventListener("click", reset);
  document.querySelectorAll('input[name="strength"]').forEach((input) => {
    input.addEventListener("change", updateStrengthLabel);
  });

  renderEmpty();
  updateStrengthLabel();
})();
