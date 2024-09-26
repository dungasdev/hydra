import {
  gameAchievementRepository,
  gameRepository,
  userPreferencesRepository,
} from "@main/repository";
import { findSteamGameAchievementFiles } from "./find-steam-game-achivement-files";
import { parseAchievementFile } from "./parse-achievement-file";
import { HydraApi } from "@main/services";
import { checkUnlockedAchievements } from "./check-unlocked-achievements";
import { mergeAchievements } from "./merge-achievements";
import type { UnlockedAchievement } from "@types";

export const saveAllLocalSteamAchivements = async () => {
  const userPreferences = await userPreferencesRepository.findOne({
    where: { id: 1 },
  });

  const gameAchievementFiles = findSteamGameAchievementFiles();

  for (const objectId of Object.keys(gameAchievementFiles)) {
    const [game, localAchievements] = await Promise.all([
      gameRepository.findOne({
        where: { objectID: objectId, shop: "steam", isDeleted: false },
      }),
      gameAchievementRepository.findOne({
        where: { objectId, shop: "steam" },
      }),
    ]);

    if (!game) continue;

    if (!localAchievements || !localAchievements.achievements) {
      await HydraApi.get(
        "/games/achievements",
        {
          shop: "steam",
          objectId,
          language: userPreferences?.language || "en",
        },
        { needsAuth: false }
      )
        .then((achievements) => {
          return gameAchievementRepository.upsert(
            {
              objectId,
              shop: "steam",
              achievements: JSON.stringify(achievements),
            },
            ["objectId", "shop"]
          );
        })
        .catch(console.log);
    }

    const unlockedAchievements: UnlockedAchievement[] = [];

    for (const achievementFile of gameAchievementFiles[objectId]) {
      const localAchievementFile = await parseAchievementFile(
        achievementFile.filePath
      );

      if (localAchievementFile) {
        unlockedAchievements.push(
          ...checkUnlockedAchievements(
            achievementFile.type,
            localAchievementFile
          )
        );
      }
    }

    mergeAchievements(objectId, "steam", unlockedAchievements);
  }
};
