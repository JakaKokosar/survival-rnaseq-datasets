from lifelines.statistics import logrank_test


def _process_one_gene(args):
    gene, df_sub, time_col, event_col = args
    median = df_sub[gene].median()
    low = df_sub[gene] <= median
    high = df_sub[gene] > median
    lr = logrank_test(
        df_sub.loc[low, time_col],
        df_sub.loc[high, time_col],
        df_sub.loc[low, event_col],
        df_sub.loc[high, event_col],
    )
    return {"gene": gene, "pvalue": lr.p_value, "test_stat": lr.test_statistic}


# # Univariable Cox analysis (continuous gene expression)
# results_cox = []
# for gene in tqdm(gene_cols):
#     fit_df = df[[time_col, event_col, gene]].dropna()
#     if len(fit_df) < 5:
#         print('yikes')
#         continue
#     cph = CoxPHFitter()
#     cph.fit(fit_df, duration_col=time_col, event_col=event_col)
#     pval = cph.summary.loc[gene, "p"]
#     results_cox.append({"gene": gene, "coef": cph.params_[gene], "pvalue": pval})

# results_df = pd.DataFrame(results_cox)
# results_df["fdr_pvalue"] = multipletests(results_df["pvalue"], method="fdr_bh")[1]
# results_df = results_df.sort_values("pvalue")