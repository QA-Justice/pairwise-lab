(function attachPairwiseCore(root) {
  "use strict";

  function unique(values) {
    return Array.from(new Set(values));
  }

  function parseFactors(text) {
    const factors = [];
    const errors = [];
    const seen = new Set();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    lines.forEach((line, index) => {
      const equalsIndex = line.indexOf("=");
      const colonIndex = line.indexOf(":");
      const separatorIndex =
        equalsIndex === -1
          ? colonIndex
          : colonIndex === -1
            ? equalsIndex
            : Math.min(equalsIndex, colonIndex);
      if (separatorIndex === -1) {
        errors.push(`Line ${index + 1}: use "Factor=value, value".`);
        return;
      }

      const name = line.slice(0, separatorIndex).trim();
      const values = unique(
        line
          .slice(separatorIndex + 1)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );

      if (!name) {
        errors.push(`Line ${index + 1}: factor name is empty.`);
        return;
      }

      if (seen.has(name)) {
        errors.push(`Line ${index + 1}: duplicate factor "${name}".`);
        return;
      }

      if (values.length === 0) {
        errors.push(`Line ${index + 1}: add at least one value.`);
        return;
      }

      seen.add(name);
      factors.push({ name, values });
    });

    if (factors.length < 2) {
      errors.push("Add at least two factors.");
    }

    return { factors, errors };
  }

  function normalizeConstraintText(line) {
    return line
      .replace(/\uFF1D/g, "=")
      .replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
      .trim();
  }

  function splitConstraintLine(line) {
    return line
      .split(/\s*(?:&&|\bAND\b|,|;|\uFF0C|\uFF1B)\s*/i)
      .map((part) => normalizeConstraintText(part))
      .filter(Boolean);
  }

  function stripWrappingQuotes(value) {
    return value.replace(/^["'](.+)["']$/, "$1").trim();
  }

  function parseConstraintPart(part, factorNames) {
    const match = part.match(/^(.+?)\s*=\s*(.+)$/);
    if (match) {
      return {
        factor: match[1].trim(),
        value: stripWrappingQuotes(match[2].trim()),
      };
    }
    return null;
  }

  function parseConstraints(text, factorSource) {
    const constraints = [];
    const errors = [];
    const factorNames = factorSource.map((factor) => {
      return typeof factor === "string" ? factor : factor.name;
    });
    const names = new Set(factorNames);
    const valuesByFactor = new Map();

    factorSource.forEach((factor) => {
      if (typeof factor !== "string") {
        valuesByFactor.set(factor.name, new Set(factor.values));
      }
    });
    const lines = text
      .split(/\r?\n/)
      .map((line) => normalizeConstraintText(line))
      .filter(Boolean);

    lines.forEach((line, index) => {
      const parts = splitConstraintLine(line);
      const conditions = [];
      let lineHasError = false;

      parts.forEach((part) => {
        if (lineHasError) {
          return;
        }

        const parsed = parseConstraintPart(part, factorNames);
        if (!parsed) {
          errors.push(`Constraint ${index + 1}: use "Factor=value".`);
          lineHasError = true;
          return;
        }

        const factor = parsed.factor;
        const value = parsed.value;

        if (!names.has(factor)) {
          errors.push(`Constraint ${index + 1}: unknown factor "${factor}".`);
          lineHasError = true;
          return;
        }

        if (!value) {
          errors.push(`Constraint ${index + 1}: empty value for "${factor}".`);
          lineHasError = true;
          return;
        }

        if (valuesByFactor.has(factor) && !valuesByFactor.get(factor).has(value)) {
          errors.push(`Constraint ${index + 1}: unknown value "${value}" for "${factor}".`);
          lineHasError = true;
          return;
        }

        conditions.push({ factor, value });
      });

      if (conditions.length > 0) {
        constraints.push({ raw: line, conditions });
      }
    });

    return { constraints, errors };
  }

  function violatesConstraint(testCase, constraint) {
    return constraint.conditions.every((condition) => {
      return testCase[condition.factor] === condition.value;
    });
  }

  function isValidCase(testCase, constraints) {
    return !constraints.some((constraint) => violatesConstraint(testCase, constraint));
  }

  function buildCandidates(factors, constraints, limit) {
    const candidates = [];

    function visit(index, current) {
      if (candidates.length > limit) {
        return;
      }

      if (index === factors.length) {
        if (isValidCase(current, constraints)) {
          candidates.push({ ...current });
        }
        return;
      }

      const factor = factors[index];
      factor.values.forEach((value) => {
        current[factor.name] = value;
        visit(index + 1, current);
      });
      delete current[factor.name];
    }

    visit(0, {});
    return candidates;
  }

  function getIndexCombinations(length, size) {
    const combinations = [];

    function visit(start, current) {
      if (current.length === size) {
        combinations.push([...current]);
        return;
      }

      for (let index = start; index <= length - (size - current.length); index += 1) {
        current.push(index);
        visit(index + 1, current);
        current.pop();
      }
    }

    visit(0, []);
    return combinations;
  }

  function tupleKey(parts) {
    return parts.map((part) => `${part.factor}\u0001${part.value}`).join("\u0002");
  }

  function getCaseTuples(testCase, factors, strength) {
    return getIndexCombinations(factors.length, strength).map((indexes) => {
      const parts = indexes.map((index) => {
        const factor = factors[index];
        return {
          factor: factor.name,
          value: testCase[factor.name],
        };
      });
      return tupleKey(parts);
    });
  }

  function buildTupleUniverse(candidates, factors, strength) {
    const tuples = new Set();
    candidates.forEach((candidate) => {
      getCaseTuples(candidate, factors, strength).forEach((tuple) => tuples.add(tuple));
    });
    return tuples;
  }

  function countNewTuples(candidate, factors, strength, uncovered) {
    return getCaseTuples(candidate, factors, strength).reduce((count, tuple) => {
      return count + (uncovered.has(tuple) ? 1 : 0);
    }, 0);
  }

  function candidateSortKey(candidate, factors) {
    return factors
      .map((factor) => `${factor.name}:${candidate[factor.name]}`)
      .join("|");
  }

  function generatePairwise(factors, constraints, options) {
    const maxCandidates = options && options.maxCandidates ? options.maxCandidates : 50000;
    const strength = options && options.strength ? Number(options.strength) : 2;

    if (![2, 3].includes(strength)) {
      throw new Error("Only 2-wise and 3-wise are supported in this MVP.");
    }

    if (factors.length < strength) {
      throw new Error(`Add at least ${strength} factors for ${strength}-wise generation.`);
    }

    const candidates = buildCandidates(factors, constraints, maxCandidates);

    if (candidates.length > maxCandidates) {
      throw new Error(`Too many valid combinations. Keep candidates under ${maxCandidates}.`);
    }

    if (candidates.length === 0) {
      throw new Error("No valid combinations remain after constraints.");
    }

    const universe = buildTupleUniverse(candidates, factors, strength);
    const uncovered = new Set(universe);
    const tests = [];

    while (uncovered.size > 0) {
      let bestCandidate = null;
      let bestScore = -1;

      candidates.forEach((candidate) => {
        const score = countNewTuples(candidate, factors, strength, uncovered);
        if (
          score > bestScore ||
          (score === bestScore &&
            bestCandidate &&
            candidateSortKey(candidate, factors) < candidateSortKey(bestCandidate, factors))
        ) {
          bestCandidate = candidate;
          bestScore = score;
        }
      });

      if (!bestCandidate || bestScore <= 0) {
        break;
      }

      tests.push(bestCandidate);
      getCaseTuples(bestCandidate, factors, strength).forEach((tuple) => uncovered.delete(tuple));
    }

    return {
      tests,
      stats: {
        candidateCount: candidates.length,
        strength,
        totalTuples: universe.size,
        coveredTuples: universe.size - uncovered.size,
        totalPairs: universe.size,
        coveredPairs: universe.size - uncovered.size,
        coverage:
          universe.size === 0
            ? 100
            : Math.round(((universe.size - uncovered.size) / universe.size) * 1000) / 10,
      },
    };
  }

  function escapeCsvCell(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function toCsv(testCases, factors) {
    const header = ["Test Case", ...factors.map((factor) => factor.name)];
    const rows = testCases.map((testCase, index) => {
      return [`TC-${String(index + 1).padStart(3, "0")}`, ...factors.map((factor) => testCase[factor.name])];
    });

    return [header, ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\r\n");
  }

  const api = {
    parseFactors,
    parseConstraints,
    generatePairwise,
    toCsv,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PairwiseCore = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
