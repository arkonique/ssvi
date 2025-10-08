# Flask api edpoints to call the ssvi model functions

from flask import Flask, request, jsonify
from SVI import *

app = Flask(__name__,static_folder="wwwroot", static_url_path="")

def to_jsonable(x):
    if isinstance(x, np.ndarray):
        return x.tolist()
    if isinstance(x, (np.floating, np.integer, np.bool_)):
        return x.item()
    if isinstance(x, (pd.Timestamp, datetime)):
        return x.isoformat()
    if isinstance(x, pd.Series):
        return to_jsonable(x.to_list())
    if isinstance(x, pd.DataFrame):
        return x.to_dict(orient='records')
    if isinstance(x, (list, tuple)):
        return [to_jsonable(v) for v in x]
    if isinstance(x, dict):
        return {k: to_jsonable(v) for k, v in x.items()}
    return x

def df_to_records_without_nans(df: pd.DataFrame):
    # Ensure object dtype so None survives JSON encoding
    out = df.astype(object).where(pd.notnull(df), None)
    return out.to_dict(orient="records")

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/chain')
def get_chain():
    symbol = request.args.get('symbol', default='AMZN', type=str)
    type = request.args.get('type', default='call', type=str)
    chain = get_option_chain(symbol)
    if type == 'call':
        df = chain['calls']
    else:
        df = chain['puts']
    records = df_to_records_without_nans(df)
    return jsonify(records)

@app.route('/api/theta')
def get_theta():
    symbol = request.args.get('symbol', default='AMZN', type=str)
    type = request.args.get('type', default='both', type=str)
    theta = get_theta_fit(symbol, type)
    return jsonify(theta)

@app.route('/api/slices')
def get_slices():
    symbol = request.args.get('symbol', default='AMZN', type=str)
    slices_df, a, b, c = get_slices_df(symbol)
    records = df_to_records_without_nans(slices_df)
    records.insert(0, {'a': a, 'b': b, 'c': c})
    return jsonify(records)

@app.route('/api/oneslice')
def get_one_slice():
    symbol = request.args.get("symbol")
    tj = float(request.args.get("t"))
    otype = request.args.get("type", "call")
    K, k, bs_mid, bs_est, w_obs, w_est = get_plot_slice_arrays(symbol, tj, otype)
    return jsonify({
        "K": to_jsonable(K),
        "k": to_jsonable(k),
        "bs_mid": to_jsonable(bs_mid),
        "bs_est": to_jsonable(bs_est),
        "w_obs": to_jsonable(w_obs),
        "w_est": to_jsonable(w_est)
    })

@app.route('/api/allslices')
def get_all_slices_api():
    symbol = request.args.get("symbol")
    otype = request.args.get("type", "call")
    all_slices_df = get_all_slices_df(symbol, otype, as_json=True)
    return jsonify(to_jsonable(all_slices_df))

@app.route('/api/ssvi')
def get_ssvi():
    k = float(request.args.get("k"))
    tj = float(request.args.get("t"))
    a = float(request.args.get("a"))
    b = float(request.args.get("b"))
    c = float(request.args.get("c"))
    rho = float(request.args.get("rho"))
    eta = float(request.args.get("eta"))
    ssvi_value = ssvi_sqrt(k, tj, a, b, c, rho, eta)
    return str(ssvi_value)

# run the app
if __name__ == '__main__':
    import os
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))