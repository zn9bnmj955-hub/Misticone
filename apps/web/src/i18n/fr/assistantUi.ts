/** AI assistant: chat texts (bubble and page). */
export const assistantUi = {
  today: "{date}",
  fallbackIntro: "L'assistant intelligent n'est pas encore activé sur ce site. Voici ce que j'ai trouvé dans l'aide :",
  fallbackNothing: "L'assistant intelligent n'est pas encore activé et je n'ai rien trouvé dans l'aide pour cette question. Essayez « Concours » pour trouver un concours ou « Mon tirage » pour votre match.",
  fallbackSuggestions: ["Comment s'inscrire à un concours ?", "Comment retrouver mon tirage ?", "Comment acheter un lien concours ?"],
  errors: {
    daily: "Vous avez posé vos {limit} questions du jour. Revenez demain, ou créez un compte pour en poser davantage.",
    dailyAccount: "Vous avez posé vos {limit} questions du jour. Revenez demain !",
    budget: "L'assistant fait une pause : le budget du mois est atteint. Il revient le mois prochain.",
    disabled: "L'assistant est momentanément désactivé.",
    busy: "L'assistant est très sollicité. Réessayez dans un instant.",
    unavailable: "L'assistant ne répond pas pour le moment. Réessayez plus tard.",
    refused: "Je ne peux pas répondre à cette demande. Posez-moi une question sur le sport ou sur le site.",
    too_long: "Ma réponse a été coupée. Posez une question plus précise.",
    limited: "Trop de questions d'affilée. Patientez un peu.",
    invalid: "Message invalide.",
  },
};
