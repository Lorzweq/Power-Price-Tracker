package fi.porssisahko.laskuri;

/** Yhden hintajakson alkuhetki ja hinta (snt/kWh). */
class PricePoint {

    final long startMillis;
    final long endMillis;
    final double price;

    PricePoint(long startMillis, long endMillis, double price) {
        this.startMillis = startMillis;
        this.endMillis = endMillis;
        this.price = price;
    }
}
