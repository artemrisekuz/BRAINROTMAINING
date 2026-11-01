window.PROPERTIES = {
  siteName: "Brainrot Cases",
  tagline: "Открывай кейсы. Собирай редкие брейны.",
  currencyName: "монет",
  supportHandle: "@your_support",

  // Картинки берутся из папки images/. Укажите имя файла вместе с расширением.
  brainrots: [
    {
      id: "noobini-pizzanini",
      name: "Noobini Pizzanini",
      price: 10,
      withdrawable: false,
      image: "noobini-pizzanini.webp"
    },
    {
      id: "taco-lucky-block",
      name: "Taco Lucky Block",
      price: 25,
      withdrawable: true,
      image: "taco-lucky-block.webp"
    },
    {
      id: "arcadragon",
      name: "Arcadragon",
      price: 8300,
      withdrawable: true,
      image: "arcadragon.webp"
    },
    {
      id: "gingerbread-base",
      name: "Gingerbread Base",
      price: 80,
      withdrawable: false,
      image: "gingerbread-base.webp"
    }
  ],

  cases: [
    {
      id: "starter",
      name: "Стартовый кейс",
      price: 15,
      image: "starter-case.webp",
      items: ["noobini-pizzanini", "taco-lucky-block"]
    },
    {
      id: "lucky-blocks",
      name: "Лаки Блоки",
      price: 99,
      image: "luckyblocks-case.webp",
      items: ["taco-lucky-block", "gingerbread-base", "arcadragon"]
    },
    {
      id: "legendary",
      name: "Легендарный кейс",
      price: 499,
      image: "legendary-case.webp",
      items: ["gingerbread-base", "arcadragon"]
    }
  ]
};
