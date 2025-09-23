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

$C=\max\big[0, w(k'_j,t_{i-1}) - w(k'_j,t_i)\big]$

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

### 1. Pull & prep everything
```python
import pandas as pd
import SVI  # your module with the notebook functions

from SVI import get_option_chain

ticker = "AAPL"
chains = get_option_chain(ticker)   # -> {'calls': df, 'puts': df} with mid, tj, k, w, F, bs_mid, type
calls, puts = chains['calls'], chains['puts']

# Combine for fitting
all_options = pd.concat([calls, puts], ignore_index=True)
```
### 2. Fit the ATM variance curve θ(t) and publish it to globals
```python
from SVI import build_theta, theta_function

# θ(t) = a + b t^c (isotonic baseline + parametric smoothing)
a, b, c = build_theta(all_options)
print("THETA_PARAMS:", (a, b, c))

# If your fitter reads θ from the module global, make it available:
SVI.THETA_PARAMS = (a, b, c)

# Optional: a callable if you want to evaluate θ(t) directly
theta = lambda t: theta_function(t, a, b, c)

# Example: θ at 30 days
print("θ(30d):", theta(30/365))
```

### 3. Get a global first guess for (ρ, η)
```python
from SVI import first_guess

# Fits (rho, eta) across all data given THETA_PARAMS
(rho_hat, eta_hat), res0 = first_guess(all_options)
print("W_PARAMS (rho, eta):", (rho_hat, eta_hat))

# If you cache these in the module too:
SVI.W_PARAMS = (rho_hat, eta_hat)
```

### 4. Plot a single maturity slice: market vs SSVI
```python
import numpy as np
from SVI import plot_slice

tjs = np.sort(all_options['tj'].unique())
tj = float(tjs[0])  # pick one maturity

# Plots prices/IVs and total variance for the chosen expiry
plot_slice(all_options, tj, rho_hat, eta_hat, a, b, c, type_o="call", save=False)
```

### 5. Build all slices and the 3D total variance surface
```python
from SVI import all_slices, plot_w_surface

# Evaluate SSVI w(k,t) across all observed maturities/strikes (and optionally plot per-slice)
Wkt = all_slices(all_options, rho_hat, eta_hat, a, b, c, type_o="call", plot=True, save=False)

# Smooth to a grid with RBF and plot w(k,t)
plot_w_surface(Wkt, save=False)
```

### 6. (OPTIONAL) Forward estimation for a single expiry
```python
import yfinance as yf
import numpy as np
from SVI import prep, compute_forwards

ticker = yf.Ticker("AAPL")
expiry = ticker.options[0]

calls_raw = ticker.option_chain(expiry).calls
puts_raw  = ticker.option_chain(expiry).puts

# Prepare (adds mid price + time-to-maturity 'tj')
calls_prep = prep(calls_raw, expiry)
puts_prep  = prep(puts_raw,  expiry)

# Robust forward per-expiry via put–call parity (across many strikes)
# NOTE: compute_forwards returns (forwards_df, calls_df_with_F, puts_df_with_F)
forwards_df, calls_F, puts_F = compute_forwards(calls_prep, puts_prep, "AAPL", r=0.05, use_weights=True)

print(forwards_df.head())  # has ['expirationDate','tj','F']
F0 = float(forwards_df['F'].iloc[0])

# Log-moneyness example for that expiry
k = np.log(calls_F.loc[calls_F['expirationDate']==expiry, 'strike'] / F0)
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
