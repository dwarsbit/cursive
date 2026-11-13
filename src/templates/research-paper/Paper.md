---
title: Paper
authors: Names and affiliations
status: Draft
order: 1
csl: apa
---

## Abstract

Background, question, method, main result and conclusion, in at most 200 words.

## Introduction

The problem and why it matters. What is known [@author2026] and what is not. Your question and contribution.^[Use a footnote for a side remark that would break the sentence.]

## Method

Participants or materials, design, procedure and analysis. The model, referred to as @eq-model:

$$
y_i = \beta_0 + \beta_1 x_i + \varepsilon_i
$$ {#eq-model}

## Results

@tbl-results gives the main estimates.

| Variable | Estimate | SE | p |
| --- | --- | --- | --- |
|  |  |  |  |

: Main results {#tbl-results}

Add a figure with `/image` and turn on "Numbered figure" under it.

## Discussion

What the results mean, how they compare with earlier work, limitations and next steps.

## Acknowledgments

Funding and thanks.

## References

```bibliography
- key: author2026
  type: article
  author:
    - Author, First
    - Author, Second
  title: Title of the article
  year: "2026"
  container: Name of the journal
```
