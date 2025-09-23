# SVI Volatility Surface Calibration

This repository contains a Jupyter Notebook (`SVI.ipynb`) for calibrating **Stochastic Volatility Inspired (SVI/SSVI)** volatility surfaces. It demonstrates the workflow for fetching option chain data, fitting ATM variance term structures, calibrating SVI parameters, and enforcing no-arbitrage constraints.

---

## 1. Setup

1. **Clone and install dependencies**:

```bash
git clone <your-repo-url>
cd <your-repo-folder>
pip install -r requirements.txt
````

2. **Dependencies**:

   * Python 3.10+
   * `numpy`, `pandas`
   * `matplotlib`
   * `scipy`
   * `scikit-learn`
   * `yfinance`

3. **Open the notebook**:

```bash
jupyter notebook SVI.ipynb
```

---

## 2. Workflow Overview

1. **Set the ticker symbol**
2. **Fetch option chain data** from Yahoo Finance
3. **Build a monotonic ATM variance function**

   $$
   \theta(t) = a + b t^c
   $$
4. **First guess of the total variance surface**

   $w(k,\theta) = \frac{\theta}{2}\left[1+\rho \phi(\theta)k+\sqrt{(\phi(\theta)k+\rho)^2+(1-\rho^2)}\right]$

   with

   $\phi(\theta) = \frac{\eta}{\sqrt{\theta}}$
   
6. **Slice-by-slice fitting** with penalties for arbitrage violations

---

## 3. No-Arbitrage Conditions

### Calendar Arbitrage

Calendar arbitrage arises when short-dated options appear “more expensive” in variance terms than longer-dated ones.

Formally, to avoid arbitrage:

$$
\frac{\partial w}{\partial t} \geq 0
$$

Crossedness measure:

1. Find intersections of \$w(k,t\_{i-1})\$ and \$w(k,t\_i)\$
2. Construct mid-knots \$K'\$ around those intersections
3. Define

$C = \max\big[0, w(k'_j,t_{i-1}) - w(k'_j,t_i)\big]$

### Butterfly Arbitrage

Butterfly arbitrage occurs when the implied density becomes negative, i.e. when convexity in strike is violated. The condition is:

$$
\frac{\partial^2 C}{\partial K^2} \geq 0
$$

or equivalently in terms of \$w(k,t)\$, ensuring local convexity.

---

## 4. Implementation Details

* **Forward Estimation**:

  $F = K + e^{rT}(C - P)$

  averaged across strikes, using put–call parity.

* **ATM Variance Smoothing**:
  Isotonic regression + power-law fit ensures monotonic \$\theta(t)\$.

* **SVI Parameters**:
  Each slice \$t\_j\$ is characterized by \$(a, b, \rho, m, \sigma)\$, calibrated by minimizing squared error with arbitrage penalties.

* **Caching**:
  `THETA_PARAMS` and `W_PARAMS` are cached for efficiency.

---

## 5. Example Usage

```python
import yfinance as yf
from SVI import prep, compute_forwards

ticker = yf.Ticker("AAPL")
expiry = ticker.options[0]

calls = ticker.option_chain(expiry).calls
puts  = ticker.option_chain(expiry).puts

calls_prep = prep(calls, expiry)
puts_prep  = prep(puts, expiry)

F = compute_forwards(calls_prep, puts_prep, "AAPL", r=0.05)
print("Forward price:", F)
```

---

## 6. Outputs

* **Forward curve** across expiries
* **Total variance vs strike** slices
* **Arbitrage-free volatility surface**

Plots include:

* Implied volatility smiles
* 3D surface of \$w(k,t)\$
* Arbitrage checks (calendar/butterfly)

---

## 7. References

* Gatheral, J. (2004). *A parsimonious arbitrage-free implied volatility parametrization with application to the valuation of volatility derivatives.*
* Gatheral, J., & Jacquier, A. (2013). *Arbitrage-free SVI volatility surfaces.*

---
