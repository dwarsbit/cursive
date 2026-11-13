---
title: Lab report
course: Course name
date: {{today}}
partners: Names of your lab partners
csl: ieee
---

## Aim

What the experiment measures, and what you expect to find.

## Theory

The relation you test, with its source [@author2026]. Refer to it in the text as @eq-model.

$$
y = a x + b
$$ {#eq-model}

## Method

1. The setup and the equipment, with its precision
2. What you varied and what you kept constant
3. How you measured

## Results

@tbl-measurements holds the measurements.

| Run | x (unit) | y (unit) | Uncertainty |
| --- | --- | --- | --- |
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

: Measurements per run {#tbl-measurements}

Add your plot with `/image` and turn on "Numbered figure" under it.

## Discussion

- Do the results agree with @eq-model?
- The main sources of error, and how large each is
- What you would change in a next run

## Conclusion

The answer to the aim, in two or three sentences, with the value you found and its uncertainty.

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
