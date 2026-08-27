from pucksstudio.queries.execution import rows_to_dataframe


def test_rows_to_dataframe_infers_late_non_null_values() -> None:
    rows = [{"event_id": index, "infraction_type": None} for index in range(100)]
    rows.append({"event_id": 100, "infraction_type": "holding"})

    frame = rows_to_dataframe(rows)

    assert frame.height == 101
    assert frame["infraction_type"].to_list()[-1] == "holding"
