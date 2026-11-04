import { ElevationService } from '@coolms/core-angular';
import { map, Observable } from 'rxjs';

/**
 * How an Elevate the person asked for ended: the session is elevated (by this prompt, or already, from another tab),
 * the installation cannot elevate here, or the person closed the prompt.
 */
export type ElevateOutcome = 'elevated' | 'unavailable' | 'declined';

/**
 * The Elevate flow every elevation state offers, in one place: the prompt opens from the person's own request only,
 * and an elevation granted elsewhere counts as granted.
 */
export function elevateOnce(elevation: ElevationService): Observable<ElevateOutcome> {
    return elevation.offerFor().pipe(
        map((granted): ElevateOutcome => {
            // offerFor() answers false without a prompt when the session is elevated already.
            if (granted || elevation.elevated()) {
                return 'elevated';
            }
            return elevation.available ? 'declined' : 'unavailable';
        }),
    );
}
